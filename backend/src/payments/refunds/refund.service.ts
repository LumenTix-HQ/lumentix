import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { TicketEntity } from '../../tickets/entities/ticket.entity';
import { Event, EventStatus } from '../../events/entities/event.entity';
import { EventSeries } from '../../events/entities/event-series.entity';
import { User } from '../../users/entities/user.entity';
import { StellarService } from '../../stellar/stellar.service';
import { AuditService } from '../../audit/audit.service';
import { EscrowService } from '../services/escrow.service';
import { NotificationService } from '../../notifications/notification.service';
import { RefundResultDto } from './dto/refund-result.dto';
import { RefundCalculatorService } from './refund-calculator.service';
import { paginate } from '../../common/pagination/pagination.helper';
import { PaginationDto } from '../../common/pagination/dto/pagination.dto';

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,

    @InjectRepository(TicketEntity)
    private readonly ticketsRepository: Repository<TicketEntity>,

    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,

    @InjectRepository(EventSeries)
    private readonly eventSeriesRepository: Repository<EventSeries>,

    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,

    private readonly stellarService: StellarService,
    private readonly auditService: AuditService,
    private readonly escrowService: EscrowService,
    private readonly notificationService: NotificationService,
    private readonly refundCalculator: RefundCalculatorService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — refundEvent(eventId)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Refund all confirmed payments for a cancelled event.
   * Returns a summary of each refund attempt.
   */
  async refundEvent(eventId: string): Promise<RefundResultDto[]> {
    // 1. Verify event exists and is cancelled
    const event = await this.eventsRepository.findOne({
      where: { id: eventId },
      select: [
        'id',
        'title',
        'status',
        'escrowPublicKey',
        'escrowSecretEncrypted',
      ],
    });

    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found.`);
    }

    if (event.status !== EventStatus.CANCELLED) {
      throw new BadRequestException(
        `Refunds can only be issued for cancelled events. ` +
          `Current status: "${event.status}".`,
      );
    }

    if (!event.escrowPublicKey || !event.escrowSecretEncrypted) {
      throw new BadRequestException(
        `Event "${eventId}" has no escrow account configured. Cannot process refunds.`,
      );
    }

    // 2. Fetch all confirmed payments for this event
    const confirmedPayments = await this.paymentsRepository.find({
      where: { eventId, status: PaymentStatus.CONFIRMED },
    });

    if (confirmedPayments.length === 0) {
      this.logger.log(`No confirmed payments to refund for event=${eventId}`);
      return [];
    }

    this.logger.log(
      `Processing ${confirmedPayments.length} refund(s) for event=${eventId}`,
    );

    // 3. Decrypt escrow secret once — shared across all refunds for this event
    const escrowSecret = await this.escrowService.decryptEscrowSecret(
      event.escrowSecretEncrypted,
    );

    // 4. Process each payment individually — failures are isolated
    const results: RefundResultDto[] = [];

    for (const payment of confirmedPayments) {
      const result = await this.processSingleRefund(
        payment,
        event.title,
        event.id,
        escrowSecret,
      );
      results.push(result);
    }

    await this.auditService.log({
      action: 'REFUND_EVENT_COMPLETED',
      userId: 'system',
      resourceId: eventId,
      meta: {
        total: results.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
    });

    // 5. If all refunds succeeded and the escrow has not been merged yet,
    //    merge the escrow account to sweep residual XLM to the platform wallet.
    const allSucceeded =
      results.length > 0 && results.every((r) => r.success);

    if (allSucceeded && event.escrowSecretEncrypted) {
      try {
        const platformPublicKey =
          process.env.PLATFORM_PUBLIC_KEY ?? '';

        if (platformPublicKey) {
          await this.stellarService.mergeAccount(
            escrowSecret,
            platformPublicKey,
          );

          // Null out escrow credentials and record the merge timestamp
          await this.eventsRepository.update(eventId, {
            escrowPublicKey: null,
            escrowSecretEncrypted: null,
            mergedAt: new Date(),
          });

          this.logger.log(
            `Escrow account merged for event=${eventId} → ${platformPublicKey}`,
          );
        } else {
          this.logger.warn(
            `PLATFORM_PUBLIC_KEY not set — skipping escrow merge for event=${eventId}`,
          );
        }
      } catch (mergeErr: unknown) {
        const reason =
          mergeErr instanceof Error
            ? mergeErr.message
            : 'Unknown error during escrow merge';
        this.logger.error(
          `Escrow merge failed for event=${eventId}: ${reason}`,
        );
        // Non-fatal: refunds already succeeded, just log the failure
      }
    }

    return results;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — checkRefundEligibility(paymentId)
  // ─────────────────────────────────────────────────────────────────────────

  async checkRefundEligibility(
    paymentId: string,
  ): Promise<{ eligible: boolean; reason?: string; refundAmount: number }> {
    const payment = await this.paymentsRepository.findOne({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException(`Payment "${paymentId}" not found.`);

    const user = await this.usersRepository.findOne({
      where: { id: payment.userId },
      select: ['id', 'stellarPublicKey'],
    });

    if (!user?.stellarPublicKey) {
      return { eligible: false, reason: 'No Stellar wallet linked', refundAmount: 0 };
    }

    let startDate: Date | undefined;
    if (payment.isSeasonPass) {
      const events = await this.eventsRepository.find({
        where: { seriesId: payment.seriesId as string },
        order: { startDate: 'ASC' },
      });
      if (events.length > 0) {
        startDate = events[0].startDate;
      }
    } else {
      const event = await this.eventsRepository.findOne({
        where: { id: payment.eventId as string },
        select: ['id', 'startDate'],
      });
      if (event) {
        startDate = event.startDate;
      }
    }

    if (startDate) {
      const cutoff = Number(process.env.REFUND_CUTOFF_HOURS ?? 24);
      const hoursToEvent = (new Date(startDate).getTime() - Date.now()) / 3_600_000;
      if (hoursToEvent < cutoff) {
        return {
          eligible: false,
          reason: `Too close to event start`,
          refundAmount: 0,
        };
    // Check cutoff: no refund if event starts within REFUND_CUTOFF_HOURS
    const event = await this.eventsRepository.findOne({
      where: { id: payment.eventId },
      select: ['id', 'startDate'],
    });

    if (event?.startDate) {
      const hoursToEvent = (new Date(event.startDate).getTime() - Date.now()) / 3_600_000;
      const proximityResult = this.refundCalculator.calculateRefundByEventProximity(
        hoursToEvent,
        Number(payment.amount),
      );
      if (!proximityResult.eligible) {
        return proximityResult;
      }
    }

    const hoursSincePurchase =
      (Date.now() - payment.createdAt.getTime()) / (1000 * 60 * 60);

    return this.refundCalculator.calculateRefundAmount(
      hoursSincePurchase,
      Number(payment.amount),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — getRefundHistoryForEvent(eventId, dto)
  // ─────────────────────────────────────────────────────────────────────────

  async getRefundHistoryForEvent(eventId: string, dto: PaginationDto) {
    const event = await this.eventsRepository.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException(`Event "${eventId}" not found.`);

    const qb = this.paymentsRepository
      .createQueryBuilder('payment')
      .where('payment.eventId = :eventId AND payment.status = :status', {
        eventId,
        status: PaymentStatus.REFUNDED,
      });

    return paginate(qb, dto, 'payment');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — getMyRefunds(userId, dto)
  // ─────────────────────────────────────────────────────────────────────────

  async getMyRefunds(userId: string, dto: PaginationDto) {
    const qb = this.paymentsRepository
      .createQueryBuilder('payment')
      .where('payment.userId = :userId AND payment.status = :status', {
        userId,
        status: PaymentStatus.REFUNDED,
      });

    return paginate(qb, dto, 'payment');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — refundSinglePayment(paymentId)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Refund a single confirmed payment. Used for individual registration cancellations.
   */
  async refundSinglePayment(paymentId: string): Promise<RefundResultDto> {
    const payment = await this.paymentsRepository.findOne({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException(`Payment "${paymentId}" not found.`);

    let escrowSecret: string;
    let title: string;
    let resourceId: string;

    if (payment.isSeasonPass) {
      const series = await this.eventSeriesRepository.findOne({
        where: { id: payment.seriesId as string },
      });
      if (!series) throw new NotFoundException(`Event series not found.`);
      if (!series.escrowPublicKey || !series.escrowSecretEncrypted) {
        throw new BadRequestException('Series has no escrow account configured');
      }
      escrowSecret = await this.escrowService.decryptEscrowSecret(
        series.escrowSecretEncrypted,
      );
      title = series.title;
      resourceId = series.id;
    } else {
      const event = await this.eventsRepository.findOne({
        where: { id: payment.eventId as string },
        select: ['id', 'title', 'escrowPublicKey', 'escrowSecretEncrypted'],
      });
      if (!event) throw new NotFoundException(`Event not found.`);
      if (!event.escrowPublicKey || !event.escrowSecretEncrypted) {
        throw new BadRequestException('Event has no escrow account configured');
      }
      escrowSecret = await this.escrowService.decryptEscrowSecret(
        event.escrowSecretEncrypted,
      );
      title = event.title;
      resourceId = event.id;
    }

    return this.processSingleRefund(payment, title, resourceId, escrowSecret);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — process a single payment refund
  // ─────────────────────────────────────────────────────────────────────────

  private async processSingleRefund(
    payment: Payment,
    title: string,
    resourceId: string,
    escrowSecret: string,
  ): Promise<RefundResultDto> {
    const base: Pick<
      RefundResultDto,
      'paymentId' | 'userId' | 'amount' | 'currency'
    > = {
      paymentId: payment.id,
      userId: payment.userId,
      amount: Number(payment.amount),
      currency: payment.currency,
    };

    try {
      const eligibility = await this.checkRefundEligibility(payment.id);
      if (!eligibility.eligible) {
        throw new BadRequestException(eligibility.reason);
      }

      const amount = eligibility.refundAmount;
      base.amount = amount;
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException(
          `Computed refund amount is zero or invalid for payment "${payment.id}".`,
        );
      }

      const user = await this.usersRepository.findOne({
        where: { id: payment.userId },
        select: ['id', 'email', 'stellarPublicKey'],
      });

      if (!user) {
        throw new NotFoundException(`User "${payment.userId}" not found.`);
      }

      if (!user.stellarPublicKey) {
        throw new BadRequestException(
          `User "${payment.userId}" has no Stellar public key on file. Cannot send refund.`,
        );
      }

      const txResponse = await this.stellarService.sendPayment(
        escrowSecret,
        user.stellarPublicKey,
        String(amount),
        payment.currency,
      );

      const txHash =
        typeof txResponse.hash === 'string' ? txResponse.hash : 'unknown';

      payment.status = PaymentStatus.REFUNDED;
      await this.paymentsRepository.save(payment);

      await this.ticketsRepository.update(
        { transactionHash: payment.transactionHash as string },
        { status: 'refunded' },
      );

      await this.auditService.log({
        action: 'REFUND_ISSUED',
        userId: payment.userId,
        resourceId: payment.id,
        meta: {
          resourceId,
          title,
          amount,
          currency: payment.currency,
          transactionHash: txHash,
          destinationPublicKey: user.stellarPublicKey,
        },
      });

      this.logger.log(
        `Refund issued: paymentId=${payment.id} user=${payment.userId} ` +
          `amount=${amount} ${payment.currency} txHash=${txHash}`,
      );

      if (user.email) {
        await this.notificationService.queueRefundEmail({
          userId: user.id,
          email: user.email,
          amount,
          refundId: payment.id,
        });
      }

      return { ...base, success: true, transactionHash: txHash };
    } catch (error: unknown) {
      const reason =
        error instanceof Error ? error.message : 'Unknown error during refund';

      await this.auditService.log({
        action: 'REFUND_FAILED',
        userId: payment.userId,
        resourceId: payment.id,
        meta: { resourceId, reason },
      });

      this.logger.error(
        `Refund failed: paymentId=${payment.id} user=${payment.userId} reason=${reason}`,
      );

      return { ...base, success: false, error: reason };
    }
  }
}
