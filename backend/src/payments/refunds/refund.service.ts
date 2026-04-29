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
import { User } from '../../users/entities/user.entity';
import { StellarService } from '../../stellar/stellar.service';
import { AuditService } from '../../audit/audit.service';
import { EscrowService } from '../services/escrow.service';
import { NotificationService } from '../../notifications/notification.service';
import { RefundResultDto } from './dto/refund-result.dto';
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

    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,

    private readonly stellarService: StellarService,
    private readonly auditService: AuditService,
    private readonly escrowService: EscrowService,
    private readonly notificationService: NotificationService,
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
        event,
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

    // Check 24h cutoff: no refund if event starts within REFUND_CUTOFF_HOURS
    const event = await this.eventsRepository.findOne({
      where: { id: payment.eventId },
      select: ['id', 'startDate'],
    });

    if (event?.startDate) {
      const cutoff = Number(process.env.REFUND_CUTOFF_HOURS ?? 24);
      const hoursToEvent = (new Date(event.startDate).getTime() - Date.now()) / 3_600_000;
      if (hoursToEvent < cutoff) {
        return {
          eligible: false,
          reason: `Too close to event start`,
          refundAmount: 0,
        };
      }
    }

    const hoursSincePurchase =
      (Date.now() - payment.createdAt.getTime()) / (1000 * 60 * 60);
    const FULL_REFUND_WINDOW_HOURS = Number(
      process.env.FULL_REFUND_WINDOW_HOURS ?? 48,
    );
    const PARTIAL_REFUND_RATE = Number(process.env.PARTIAL_REFUND_RATE ?? 0.5);

    const refundAmount =
      hoursSincePurchase <= FULL_REFUND_WINDOW_HOURS
        ? Number(payment.amount)
        : Number(payment.amount) * PARTIAL_REFUND_RATE;

    return { eligible: true, refundAmount };
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

    const event = await this.eventsRepository.findOne({
      where: { id: payment.eventId },
      select: ['id', 'title', 'status', 'escrowPublicKey', 'escrowSecretEncrypted'],
    });
    if (!event) throw new NotFoundException(`Event not found.`);

    if (!event.escrowPublicKey || !event.escrowSecretEncrypted) {
      throw new BadRequestException('Event has no escrow account configured');
    }

    const escrowSecret = await this.escrowService.decryptEscrowSecret(
      event.escrowSecretEncrypted,
    );

    return this.processSingleRefund(payment, event, escrowSecret);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — process a single payment refund
  // ─────────────────────────────────────────────────────────────────────────

  private async processSingleRefund(
    payment: Payment,
    event: Event,
    escrowSecret: string,
  ): Promise<RefundResultDto> {
    const base: Pick<
      RefundResultDto,
      'paymentId' | 'userId' | 'amount' | 'currency'
    > = {
      paymentId: payment.id,
      userId: payment.userId,
      amount: Number(payment.amount), // updated below after eligibility check
      currency: payment.currency,
    };

    try {
      // 1. Check eligibility and compute refund amount per policy
      const eligibility = await this.checkRefundEligibility(payment.id);
      if (!eligibility.eligible) {
        throw new BadRequestException(eligibility.reason);
      }

      const amount = eligibility.refundAmount;
      base.amount = amount; // reflect actual refund amount in result
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException(
          `Computed refund amount is zero or invalid for payment "${payment.id}".`,
        );
      }

      // 2. Resolve the user's Stellar public key
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

      // 3. Send computed amount back to the original payer via StellarService
      const txResponse = await this.stellarService.sendPayment(
        escrowSecret,
        user.stellarPublicKey,
        String(amount),
        payment.currency,
      );

      const txHash =
        typeof txResponse.hash === 'string' ? txResponse.hash : 'unknown';

      // 4. Mark payment as refunded
      payment.status = PaymentStatus.REFUNDED;
      await this.paymentsRepository.save(payment);

      // 5. Mark associated ticket as refunded
      await this.ticketsRepository.update(
        { eventId: event.id, ownerId: payment.userId },
        { status: 'refunded' },
      );

      // 6. Audit log
      await this.auditService.log({
        action: 'REFUND_ISSUED',
        userId: payment.userId,
        resourceId: payment.id,
        meta: {
          eventId: event.id,
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

      // Audit the failure but do NOT rethrow — we continue processing others
      await this.auditService.log({
        action: 'REFUND_FAILED',
        userId: payment.userId,
        resourceId: payment.id,
        meta: { eventId: event.id, reason },
      });

      this.logger.error(
        `Refund failed: paymentId=${payment.id} user=${payment.userId} reason=${reason}`,
      );

      return { ...base, success: false, error: reason };
    }
  }
}
