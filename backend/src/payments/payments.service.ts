import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { AuditService } from '../audit/audit.service';
import { PaginationDto } from '../common/pagination/pagination.dto';
import { paginate } from '../common/pagination/pagination.helper';
import { CurrenciesService } from '../currencies/currencies.service';
import { EventStatus } from '../events/entities/event.entity';
import { EventsService } from '../events/events.service';
import { NotificationService } from '../notifications/notification.service';
import { StellarService } from '../stellar/stellar.service';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { Payment, PaymentStatus } from './entities/payment.entity';

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
  ) {}

  async getPaymentById(id: string): Promise<Payment> {
    const payment = await this.paymentsRepository.findOne({ where: { id } });
    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }
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

  async createPaymentIntent(
    eventId: string,
    userId: string,
    currency?: string,
    _usePathPayment?: boolean,
    _sourceAsset?: string,
  ) {
    const event = await this.eventsService.getEventById(eventId);

    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('This event is suspended.');
    }

    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException('This event is not available for purchase.');
    }

    if (!event.escrowPublicKey) {
      throw new ConflictException(
        'This event does not have an escrow wallet configured.',
      );
    }

    const selectedCurrency = currency?.toUpperCase() ?? event.currency;
    const activeCodes = await this.currenciesService.findActiveCodes();

    if (!activeCodes.includes(selectedCurrency)) {
      throw new BadRequestException(
        `Currency "${selectedCurrency}" is not supported. Supported: ${activeCodes.join(', ')}`,
      );
    }

    const payment = this.paymentsRepository.create({
      eventId,
      userId,
      amount: Number(event.ticketPrice),
      currency: selectedCurrency,
      status: PaymentStatus.PENDING,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      transactionHash: null,
    });

    const saved = await this.paymentsRepository.save(payment);

    await this.auditService.log({
      action: AuditAction.PAYMENT_INTENT_CREATED,
      userId,
      resourceId: saved.id,
      meta: {
        eventId,
        amount: Number(saved.amount),
        currency: saved.currency,
      },
    });

    return {
      paymentId: saved.id,
      amount: Number(saved.amount),
      currency: saved.currency,
      escrowWallet: event.escrowPublicKey,
      memo: saved.id,
      expiresAt: saved.expiresAt,
    };
  }

  async confirmPayment(input: ConfirmPaymentDto | string, userId: string) {
    const transactionHash =
      typeof input === 'string' ? input : input.transactionHash;

    let txRecord: Awaited<ReturnType<StellarService['getTransaction']>>;
    try {
      txRecord = await this.stellarService.getTransaction(transactionHash);
    } catch {
      throw new BadRequestException(
        `Transaction "${transactionHash}" not found on the Stellar network.`,
      );
    }

    const memoValue = this.stellarService.extractAndValidateMemo(txRecord);
    const payment = await this.paymentsRepository.findOne({
      where: {
        id: memoValue,
        status: PaymentStatus.PENDING,
      },
    });

    if (!payment) {
      throw new NotFoundException(
        `No pending payment found for memo "${memoValue}".`,
      );
    }

    if (userId !== 'system' && payment.userId !== userId) {
      throw new ForbiddenException('You are not authorised to confirm this payment.');
    }

    if (payment.expiresAt && payment.expiresAt < new Date()) {
      payment.status = PaymentStatus.FAILED;
      await this.paymentsRepository.save(payment);
      throw new BadRequestException('Payment has expired.');
    }

    const event = await this.eventsService.getEventById(payment.eventId);
    if (!event.escrowPublicKey) {
      throw new ConflictException(
        'This event does not have an escrow wallet configured.',
      );
    }

    const operations = await this.resolvePaymentOperations(txRecord);
    if (operations.length === 0) {
      throw new BadRequestException('Transaction contains no payment operations.');
    }

    const matchingOperation = operations.find(
      (operation) => operation.to === event.escrowPublicKey,
    );

    if (!matchingOperation) {
      throw new BadRequestException(
        'Payment destination does not match the escrow wallet.',
      );
    }

    const assetCode = this.extractAssetCode(matchingOperation);
    if (assetCode !== payment.currency.toUpperCase()) {
      throw new BadRequestException(
        'Payment asset does not match expected currency',
      );
    }

    const onChainAmount = parseFloat(matchingOperation.amount);
    const expectedAmount = Number(payment.amount);
    if (Math.abs(onChainAmount - expectedAmount) > 0.0000001) {
      throw new BadRequestException(
        `Incorrect payment amount. Expected ${expectedAmount}, received ${onChainAmount}.`,
      );
    }

    payment.status = PaymentStatus.CONFIRMED;
    payment.transactionHash = transactionHash;
    const confirmed = await this.paymentsRepository.save(payment);

    await this.auditService.log({
      action: AuditAction.PAYMENT_CONFIRMED,
      userId: payment.userId,
      resourceId: payment.id,
      meta: {
        transactionHash,
        currency: payment.currency,
        amount: Number(payment.amount),
      },
    });

    return confirmed;
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

  private async resolvePaymentOperations(
    txRecord: Awaited<ReturnType<StellarService['getTransaction']>>,
  ): Promise<PaymentOperation[]> {
    try {
      const operationsHref = txRecord._links.operations?.href;
      if (!operationsHref) {
        return [];
      }

      const response = await fetch(operationsHref);
      if (!response.ok) {
        return [];
      }

      const payload = (await response.json()) as {
        _embedded?: { records?: PaymentOperation[] };
      };

      return (payload._embedded?.records ?? []).filter(
        (operation) => operation.type === 'payment',
      );
    } catch {
      return [];
    }
  }

  private extractAssetCode(operation: PaymentOperation): string {
    if (operation.asset_type === 'native') {
      return 'XLM';
    }

    return (operation.asset_code ?? '').toUpperCase();
  }

  private async markFailed(payment: Payment, reason: string): Promise<void> {
    payment.status = PaymentStatus.FAILED;
    await this.paymentsRepository.save(payment);

    await this.auditService.log({
      action: AuditAction.PAYMENT_FAILED,
      userId: payment.userId,
      resourceId: payment.id,
      meta: { reason, currency: payment.currency },
    });

    try {
      const event = await this.eventsService.getEventById(payment.eventId);
      await this.notificationService.queuePaymentFailedEmail({
        userId: payment.userId,
        email: '',
        eventTitle: event.title,
        amount: Number(payment.amount),
        currency: payment.currency,
        reason,
      });
    } catch (error) {
      console.error(
        `Failed to queue payment failure email for ${payment.id}:`,
        error,
      );
    }
  }
}

interface PaymentOperation {
  type: string;
  to: string;
  amount: string;
  asset_type: string;
  asset_code?: string;
}
