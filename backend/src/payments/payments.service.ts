import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { PaginationDto } from '../common/pagination/dto/pagination.dto';
import { paginate } from '../common/pagination/pagination.helper';
import { EventsService } from '../events/events.service';
import { StellarService } from '../stellar/stellar.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly eventsService: EventsService,
    private readonly stellarService: StellarService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  async getPaymentById(id: string): Promise<Payment> {
    const payment = await this.paymentsRepository.findOne({ where: { id } });
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    return payment;
  }

  async getHistory(userId: string, dto: PaginationDto) {
    const qb = this.paymentsRepository
      .createQueryBuilder('payment')
      .where('payment.userId = :userId', { userId })
      .orderBy('payment.createdAt', 'DESC');
    return paginate(qb, dto, 'payment');
  }

  async getPending(userId: string, dto: PaginationDto) {
    const qb = this.paymentsRepository
      .createQueryBuilder('payment')
      .where('payment.userId = :userId', { userId })
      .andWhere('payment.status = :status', { status: PaymentStatus.PENDING })
      .orderBy('payment.createdAt', 'DESC');
    return paginate(qb, dto, 'payment');
  }

  async createPaymentIntent(eventId: string, userId: string) {
    const event = await this.eventsService.getEventById(eventId);

    if (event.status === 'cancelled' as any) {
      throw new BadRequestException('Event is suspended');
    }
    if ((event as any).status !== 'published') {
      throw new BadRequestException('Event is not available for purchase');
    }
    if (!event.escrowPublicKey) {
      throw new BadRequestException('Event does not have an escrow wallet configured');
    }

    const SUPPORTED = ['XLM', 'USDC'];
    if (!SUPPORTED.includes(event.currency?.toUpperCase())) {
      throw new BadRequestException(`Unsupported asset: ${event.currency}`);
    }

    if (event.maxAttendees !== null) {
      const sold = await this.paymentsRepository.count({
        where: { eventId, status: PaymentStatus.CONFIRMED },
      });
      if (sold >= event.maxAttendees) {
        throw new BadRequestException('Event has reached maximum capacity');
      }
    }

    const existing = await this.paymentsRepository.findOne({
      where: { eventId, userId, status: PaymentStatus.PENDING },
    });

    if (existing) {
      if (existing.expiresAt && existing.expiresAt > new Date()) {
        return {
          paymentId: existing.id,
          memo: existing.id,
          amount: Number(existing.amount),
          currency: existing.currency,
          escrowWallet: event.escrowPublicKey,
          expiresAt: existing.expiresAt,
        };
      }
      existing.status = PaymentStatus.FAILED;
      await this.paymentsRepository.save(existing);
    }

    const ttl = 30;
    const payment = this.paymentsRepository.create({
      eventId,
      userId,
      amount: event.ticketPrice,
      currency: event.currency,
      status: PaymentStatus.PENDING,
      expiresAt: new Date(Date.now() + ttl * 60 * 1000),
    });
    const saved = await this.paymentsRepository.save(payment);

    await this.auditService.log({
      action: 'PAYMENT_INTENT_CREATED',
      userId,
      resourceId: saved.id,
    });

    return {
      paymentId: saved.id,
      memo: saved.id,
      amount: Number(saved.amount),
      currency: saved.currency,
      escrowWallet: event.escrowPublicKey,
      expiresAt: saved.expiresAt,
    };
  }

  async confirmPayment(transactionHash: string, userId: string): Promise<Payment> {
    const tx = await this.stellarService.getTransaction(transactionHash).catch(() => {
      throw new BadRequestException('Transaction not found on the Stellar network');
    });

    const memo = this.stellarService.extractAndValidateMemo(tx);

    const payment = await this.paymentsRepository.findOne({
      where: { id: memo, status: PaymentStatus.PENDING },
    });
    if (!payment) throw new NotFoundException(`No pending payment for memo ${memo}`);

    if (payment.expiresAt && payment.expiresAt < new Date()) {
      payment.status = PaymentStatus.FAILED;
      await this.paymentsRepository.save(payment);
      throw new BadRequestException('Payment has expired');
    }

    if (userId !== 'system' && payment.userId !== userId) {
      throw new ForbiddenException('You are not authorised to confirm this payment');
    }

    const event = await this.eventsService.getEventById(payment.eventId);
    const opsHref = (tx as any)._links?.operations?.href;
    const opsRes = await fetch(opsHref);
    const opsJson = (await opsRes.json()) as { _embedded: { records: any[] } };
    const ops = opsJson._embedded.records.filter((o: any) => o.type === 'payment');

    if (ops.length === 0) throw new BadRequestException('Transaction has no payment operations');

    const op = ops[0];
    if (op.to !== event.escrowPublicKey) {
      throw new BadRequestException('Payment destination does not match the escrow wallet');
    }
    if (op.asset_type !== 'credit_alphanum4' && op.asset_type !== 'credit_alphanum12') {
      throw new BadRequestException('Incorrect asset type');
    }
    if (Math.abs(parseFloat(op.amount) - Number(payment.amount)) > 0.0000001) {
      throw new BadRequestException('Incorrect payment amount');
    }

    payment.status = PaymentStatus.CONFIRMED;
    payment.transactionHash = transactionHash;
    const saved = await this.paymentsRepository.save(payment);

    await this.auditService.log({
      action: 'PAYMENT_CONFIRMED',
      userId: payment.userId,
      resourceId: payment.id,
    });

    return saved;
  }

  async expireStalePayments(): Promise<void> {
    const expired = await this.paymentsRepository.find({
      where: { status: PaymentStatus.PENDING, expiresAt: LessThan(new Date()) },
    });
    for (const p of expired) {
      p.status = PaymentStatus.FAILED;
      await this.paymentsRepository.save(p);
      await this.auditService.log({
        action: 'PAYMENT_EXPIRED',
        userId: p.userId,
        resourceId: p.id,
      });
    }
  }

  async findPaymentPath(
    sourcePublicKey: string,
    sourceAsset: string,
    destAsset: string,
    destAmount: string,
  ) {
    return this.stellarService.findPaymentPath(
      sourcePublicKey,
      sourceAsset,
      destAsset,
      destAmount,
    );
  }
}
