import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from './enums/payment-status.enum';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { PaginationDto } from '../common/pagination/pagination.dto';
import { paginate } from '../common/pagination/pagination.helper';
import { CurrenciesService } from '../currencies/currencies.service';
import { EventsService } from '../events/events.service';
import { StellarService } from '../stellar/stellar.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    private readonly currenciesService: CurrenciesService,
    private readonly eventsService: EventsService,
    private readonly stellarService: StellarService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) { }

  // ----------------------------------------------------------------
  // Issue #126 – getPaymentById (used by controller status endpoint)
  // ----------------------------------------------------------------
  async getPaymentById(id: string): Promise<Payment> {
    const payment = await this.paymentsRepository.findOne({ where: { id } });
    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }
    return payment;
  }

  // Issue #126 – paginated payment history for a user
  async getHistory(userId: string, dto: PaginationDto) {
    const qb = this.paymentsRepository
      .createQueryBuilder('payment')
      .where('payment.userId = :userId', { userId })
      .orderBy('payment.createdAt', 'DESC');
    return paginate(qb, dto, 'payment');
  }

  // Issue #126 – paginated PENDING payments for a user
  async getPending(userId: string, dto: PaginationDto) {
    const qb = this.paymentsRepository
      .createQueryBuilder('payment')
      .where('payment.userId = :userId', { userId })
      .andWhere('payment.status = :status', { status: PaymentStatus.PENDING })
      .orderBy('payment.createdAt', 'DESC');
    return paginate(qb, dto, 'payment');
  }

  // ----------------------------------------------------------------
  // Issue #128 – createPaymentIntent with optional currency validation
  // Issue #129 – optional path payment support
  // ----------------------------------------------------------------
  async createPaymentIntent(
    eventId: string,
    userId: string,
    currency?: string,
    usePathPayment?: boolean,
    sourceAsset?: string,
  ) {
    const event = await this.eventsService.getEventById(eventId);
    const selectedCurrency = currency ?? event.currency;

    // Issue #128 – validate currency against supported assets
    const supportedCodes = await this.currenciesService.findActiveCodes();
    if (!supportedCodes.includes(selectedCurrency.toUpperCase())) {
      throw new BadRequestException(
        `Currency "${selectedCurrency}" is not supported.`,
      );
    }

    // Issue #129 – if path payment requested, validate sourceAsset too
    if (usePathPayment && sourceAsset) {
      if (!supportedCodes.includes(sourceAsset.toUpperCase())) {
        throw new BadRequestException(
          `Source asset "${sourceAsset}" is not supported.`,
        );
      }
    }

    const payment = this.paymentsRepository.create({
      userId,
      eventId,
      currency: selectedCurrency.toUpperCase(),
      status: PaymentStatus.PENDING,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min expiry
      // Issue #129 – store source asset for path payment
      sourceAsset: usePathPayment && sourceAsset
        ? sourceAsset.toUpperCase()
        : null,
      isPathPayment: usePathPayment ?? false,
    });

    const saved = await this.paymentsRepository.save(payment);

    return {
      paymentId: saved.id,
      currency: saved.currency,
      sourceAsset: saved.sourceAsset,
      isPathPayment: saved.isPathPayment,
      expiresAt: saved.expiresAt,
      stellarAddress: event.stellarAddress,
    };
  }

  // ----------------------------------------------------------------
  // Existing – confirmPayment updated for Issue #128 & #129
  // ----------------------------------------------------------------
  async confirmPayment(dto: ConfirmPaymentDto, userId: string) {
    const payment = await this.getPaymentById(dto.paymentId);

    if (payment.userId !== userId) {
      throw new ForbiddenException('You do not own this payment');
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(
        `Payment is already ${payment.status.toLowerCase()}`,
      );
    }

    if (payment.expiresAt && payment.expiresAt < new Date()) {
      payment.status = PaymentStatus.FAILED;
      await this.paymentsRepository.save(payment);
      throw new BadRequestException('Payment has expired');
    }

    // Issue #128 – verify on-chain asset matches stored currency
    const txAsset = await this.stellarService.getTransactionAsset(dto.txHash);
    if (txAsset.toUpperCase() !== payment.currency.toUpperCase()) {
      throw new BadRequestException(
        `Transaction asset "${txAsset}" does not match expected "${payment.currency}"`,
      );
    }

    payment.status = PaymentStatus.CONFIRMED;
    payment.txHash = dto.txHash;
    return this.paymentsRepository.save(payment);
  }

  // ----------------------------------------------------------------
  // Issue #129 – find Stellar payment path
  // ----------------------------------------------------------------
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

  // ----------------------------------------------------------------
  // Issue #127 – expire stale payments (called by scheduled job)
  // ----------------------------------------------------------------
  async expireStalePayments(): Promise<void> {
    const expired = await this.paymentsRepository.find({
      where: {
        status: PaymentStatus.PENDING,
        expiresAt: LessThan(new Date()),
      },
    });

    for (const payment of expired) {
      await this.markFailed(payment, 'Payment expired');
    }
  }

  private async markFailed(payment: Payment, reason: string): Promise<void> {
    payment.status = PaymentStatus.FAILED;
    await this.paymentsRepository.save(payment);

    await this.auditService.log({
      action: 'PAYMENT_FAILED',
      entityId: payment.id,
      entityType: 'Payment',
      userId: payment.userId,
      metadata: { reason, currency: payment.currency },
    });

    try {
      const event = await this.eventsService.getEventById(payment.eventId);
      await this.notificationService.queuePaymentFailedEmail({
        userId: payment.userId,
        email: '', // Handled by processor
        eventTitle: event.title,
        amount: Number(payment.amount),
        currency: payment.currency,
        reason,
      });
    } catch (error) {
      // Log error but don't fail the marking process
      console.error(`Failed to queue payment failure email for ${payment.id}:`, error);
    }
  }
}