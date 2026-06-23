import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { PaginationDto } from '../common/pagination/dto/pagination.dto';
import { paginate } from '../common/pagination/pagination.helper';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { AuditService } from '../audit/audit.service';
import { CurrenciesService } from '../currencies/currencies.service';
import { EventStatus, Event } from '../events/entities/event.entity';
import { EventsService } from '../events/events.service';
import { EventSeries } from '../events/entities/event-series.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { NotificationService } from '../notifications/notification.service';
import { StellarService } from '../stellar/stellar.service';
import { User } from '../users/entities/user.entity';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { EscrowService } from './services/escrow.service';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { WebhooksService } from '../webhooks/webhooks.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(EventSeries)
    private readonly eventSeriesRepository: Repository<EventSeries>,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(TicketEntity)
    private readonly ticketRepository: Repository<TicketEntity>,
    private readonly eventsService: EventsService,
    private readonly stellarService: StellarService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    private readonly currenciesService: CurrenciesService,
    private readonly escrowService: EscrowService,
    private readonly webhooksService: WebhooksService,
    
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

    // Capacity check
    if (event.maxAttendees !== null) {
      const sold = await this.ticketRepository.count({
        where: { eventId, status: 'valid' },
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

    let finalPrice = Number(event.ticketPrice);

    // Apply series discount if user owns another ticket in the series
    if (event.seriesId) {
      const series = await this.eventSeriesRepository.findOne({
        where: { id: event.seriesId },
      });
      if (series && series.discountPercentage && series.discountPercentage > 0) {
        const ownedTicketsCount = await this.ticketRepository.count({
          where: { ownerId: userId, eventId: In(
            await this.eventRepository.find({
              select: ['id'],
              where: { seriesId: event.seriesId },
            }).then((evs) => evs.map((e) => e.id))
          ), status: 'valid' },
        });

        if (ownedTicketsCount > 0) {
          finalPrice = finalPrice * (1 - Number(series.discountPercentage) / 100);
        }
      }
    }

    const payment = this.paymentsRepository.create({
      eventId,
      userId,
      amount: finalPrice,
      currency: selectedCurrency,
      status: PaymentStatus.PENDING,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes TTL
      transactionHash: null,
      seriesId: event.seriesId,
      isSeasonPass: false,
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
      memo: saved.id,
      amount: Number(saved.amount),
      currency: saved.currency,
      escrowWallet: event.escrowPublicKey,
      expiresAt: saved.expiresAt,
    };
  }

  async createSeasonPassIntent(
    seriesId: string,
    userId: string,
    currency?: string,
  ) {
    const series = await this.eventSeriesRepository.findOne({
      where: { id: seriesId },
    });

    if (!series) {
      throw new NotFoundException('Event series not found');
    }

    if (!series.seasonPassPrice) {
      throw new BadRequestException('This series does not offer a season pass.');
    }

    if (!series.escrowPublicKey) {
      throw new ConflictException(
        'This series does not have an escrow wallet configured.',
      );
    }

    const selectedCurrency = currency?.toUpperCase() ?? series.currency;
    const activeCodes = await this.currenciesService.findActiveCodes();

    if (!activeCodes.includes(selectedCurrency)) {
      throw new BadRequestException(
        `Currency "${selectedCurrency}" is not supported. Supported: ${activeCodes.join(', ')}`,
      );
    }

    const existing = await this.paymentsRepository.findOne({
      where: { seriesId, userId, status: PaymentStatus.PENDING, isSeasonPass: true },
    });

    if (existing) {
      if (existing.expiresAt && existing.expiresAt > new Date()) {
        return {
          paymentId: existing.id,
          memo: existing.id,
          amount: Number(existing.amount),
          currency: existing.currency,
          escrowWallet: series.escrowPublicKey,
          expiresAt: existing.expiresAt,
        };
      }
      existing.status = PaymentStatus.FAILED;
      await this.paymentsRepository.save(existing);
    }

    const payment = this.paymentsRepository.create({
      eventId: null,
      seriesId,
      isSeasonPass: true,
      userId,
      amount: Number(series.seasonPassPrice),
      currency: selectedCurrency,
      status: PaymentStatus.PENDING,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 mins
      transactionHash: null,
    });
    const saved = await this.paymentsRepository.save(payment);

    await this.auditService.log({
      action: AuditAction.PAYMENT_INTENT_CREATED,
      userId,
      resourceId: saved.id,
      meta: {
        seriesId,
        amount: Number(saved.amount),
        currency: saved.currency,
        isSeasonPass: true,
      },
    });

    return {
      paymentId: saved.id,
      memo: saved.id,
      amount: Number(saved.amount),
      currency: saved.currency,
      escrowWallet: series.escrowPublicKey,
      expiresAt: saved.expiresAt,
    };
  }

  async confirmPayment(
    input: ConfirmPaymentDto | string,
    userId: string,
  ): Promise<Payment> {
    const transactionHash =
      typeof input === 'string' ? input : input.transactionHash;

    let txRecord: any;
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

    let targetEscrowPublicKey: string | null = null;
    if (payment.isSeasonPass) {
      const series = await this.eventSeriesRepository.findOne({
        where: { id: payment.seriesId as string },
      });
      if (!series || !series.escrowPublicKey) {
        throw new ConflictException('Escrow wallet is not configured for this series.');
      }
      targetEscrowPublicKey = series.escrowPublicKey;
    } else {
      const event = await this.eventsService.getEventById(payment.eventId as string);
      if (!event.escrowPublicKey) {
        throw new ConflictException('Escrow wallet is not configured for this event.');
      }
      targetEscrowPublicKey = event.escrowPublicKey;
    }

    const operations = await this.resolvePaymentOperations(txRecord);
    if (operations.length === 0) {
      throw new BadRequestException('Transaction contains no payment operations.');
    }

    const matchingOperation = operations.find(
      (operation) => operation.to === targetEscrowPublicKey,
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

    this.webhooksService.queueDelivery(event, confirmed).catch(() => undefined);

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

  private async resolvePaymentOperations(txRecord: any): Promise<PaymentOperation[]> {
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
    const saved = await this.paymentsRepository.save(payment);

    await this.auditService.log({
      action: AuditAction.PAYMENT_FAILED,
      userId: payment.userId,
      resourceId: payment.id,
      meta: { reason, currency: payment.currency },
    });

    try {
      if (payment.eventId) {
        const event = await this.eventsService.getEventById(payment.eventId);
        await this.notificationService.queuePaymentFailedEmail({
          userId: payment.userId,
          email: '',
          eventTitle: event.title,
          amount: Number(payment.amount),
          currency: payment.currency,
          reason,
        });
      }
      const event = await this.eventsService.getEventById(payment.eventId);
      await this.notificationService.queuePaymentFailedEmail({
        userId: payment.userId,
        email: '',
        eventTitle: event.title,
        amount: Number(payment.amount),
        currency: payment.currency,
        reason,
      });
      this.webhooksService.queueDelivery(event, saved).catch(() => undefined);
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
