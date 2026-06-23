import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { RefundDispute } from './entities/refund-dispute.entity';
import { TicketEntity } from '../../tickets/entities/ticket.entity';
import { Event, EventStatus } from '../../events/entities/event.entity';
import { EventSeries } from '../../events/entities/event-series.entity';
import { User } from '../../users/entities/user.entity';
import { StellarService } from '../../stellar/stellar.service';
import { AuditService } from '../../audit/audit.service';
import { EscrowService } from '../services/escrow.service';
import { NotificationService } from '../../notifications/notification.service';
import { RefundResultDto } from './dto/refund-result.dto';
import {
  ProcessAutomaticRefundDto,
  CalculateRefundAmountDto,
  CreateRefundDisputeDto,
  RefundDisputeDto,
  AutomaticRefundResultDto,
} from './dto';
import { RefundPolicyService } from './services/refund-policy.service';
import {
  CancellationReason,
  RefundDisputeStatus,
  RefundProcessingMode,
} from './enums';
import { RefundCalculatorService } from './refund-calculator.service';
import { paginate } from '../../common/pagination/pagination.helper';
import { PaginationDto } from '../../common/pagination/dto/pagination.dto';

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,

    @InjectRepository(RefundDispute)
    private readonly refundDisputeRepository: Repository<RefundDispute>,

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
    private readonly refundPolicyService: RefundPolicyService,
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
  // PUBLIC — processAutomaticRefund(dto)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Intelligent automated refund processing for cancelled events.
   *
   * This method:
   * - Evaluates cancellation reason and timing
   * - Applies appropriate refund policy
   * - Respects user preferences for refund processing
   * - Processes refunds in batches for large events
   * - Provides detailed reporting
   *
   * @param dto Configuration for automated refund processing
   * @returns Summary of refund processing results
   */
  async processAutomaticRefund(
    dto: ProcessAutomaticRefundDto,
  ): Promise<AutomaticRefundResultDto> {
    const startTime = Date.now();
    const {
      eventId,
      cancellationReason,
      cancellationDetails,
      notifyUsers = true,
      batchSize = 50,
      batchDelayMs = 100,
      allowPartialRefunds = true,
      metadata = {},
    } = dto;

    // 1. Fetch and validate event
    const event = await this.eventsRepository.findOne({
      where: { id: eventId },
      select: [
        'id',
        'title',
        'status',
        'startDate',
        'escrowPublicKey',
        'escrowSecretEncrypted',
      ],
    });

    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found.`);
    }

    if (event.status !== EventStatus.CANCELLED) {
      throw new BadRequestException(
        `Event must be in CANCELLED status for automatic refund processing.`,
      );
    }

    if (!event.escrowPublicKey || !event.escrowSecretEncrypted) {
      throw new BadRequestException(
        `Event "${eventId}" has no escrow account configured.`,
      );
    }

    // 2. Update event with cancellation reason and details
    await this.eventsRepository.update(
      { id: eventId },
      {
        cancellationReason,
        cancellationDetails: cancellationDetails || null,
        cancelledAt: new Date(),
      } as any,
    );

    // 3. Fetch all confirmed payments
    const confirmedPayments = await this.paymentsRepository.find({
      where: { eventId, status: PaymentStatus.CONFIRMED },
    });

    if (confirmedPayments.length === 0) {
      this.logger.log(`No payments to refund for event=${eventId}`);
      return {
        eventId,
        totalRefunds: 0,
        successfulRefunds: 0,
        failedRefunds: 0,
        skippedRefunds: 0,
        totalRefundedAmount: 0,
        currency: 'USD',
        refundResults: [],
        processedAt: new Date(),
        executionTimeMs: Date.now() - startTime,
        summary: {
          totalPaymentAmount: 0,
          averageRefundAmount: 0,
          successRate: 100,
        },
      };
    }

    this.logger.log(
      `Starting automated refund processing: event=${eventId} ` +
        `payments=${confirmedPayments.length} reason=${cancellationReason}`,
    );

    // 4. Decrypt escrow secret once
    const escrowSecret = await this.escrowService.decryptEscrowSecret(
      event.escrowSecretEncrypted,
    );

    // 5. Process payments in batches
    const results: RefundResultDto[] = [];
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;
    let totalRefunded = 0;
    const totalPaymentAmount = confirmedPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );

    for (let i = 0; i < confirmedPayments.length; i += batchSize) {
      const batch = confirmedPayments.slice(i, i + batchSize);

      for (const payment of batch) {
        try {
          // Check eligibility based on cancellation reason
          const eligibility = this.refundPolicyService.isRefundEligible(
            payment.createdAt,
            event.startDate,
            cancellationReason,
          );

          if (!eligibility.eligible) {
            this.logger.warn(
              `Skipping refund for payment=${payment.id}: ${eligibility.reason}`,
            );
            skipCount++;
            continue;
          }

          // Calculate refund amount based on policy
          const user = await this.usersRepository.findOne({
            where: { id: payment.userId },
            select: ['id', 'refundPreferences'],
          });

          const calculationDto: CalculateRefundAmountDto = {
            paymentAmount: Number(payment.amount),
            currency: payment.currency,
            paymentCreatedAt: payment.createdAt,
            eventStartDate: event.startDate,
            cancellationReason,
            userRefundPreference: user?.refundPreferences?.preferFullRefund
              ? 'full'
              : undefined,
            requestInstantRefund: user?.refundPreferences?.preferInstantProcessing,
          };

          const calculation =
            this.refundPolicyService.calculateRefundAmount(calculationDto);

          if (!allowPartialRefunds && calculation.refundPercentage < 100) {
            this.logger.warn(
              `Skipping partial refund: payment=${payment.id} policy forbids partial`,
            );
            skipCount++;
            continue;
          }

          // Process the refund
          const result = await this.processAutomaticPaymentRefund(
            payment,
            event,
            escrowSecret,
            calculation.refundAmount,
          );

          if (result.success) {
            successCount++;
            totalRefunded += result.amount;
          } else {
            failCount++;
          }

          results.push(result);
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Error processing refund for payment=${payment.id}: ${errorMsg}`,
          );
          failCount++;
          results.push({
            paymentId: payment.id,
            userId: payment.userId,
            amount: Number(payment.amount),
            currency: payment.currency,
            success: false,
            error: errorMsg,
          });
        }
      }

      // Batch delay to avoid overwhelming the system
      if (i + batchSize < confirmedPayments.length) {
        await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
      }
    }

    // 6. Send notifications if enabled
    if (notifyUsers) {
      for (const result of results.filter((r) => r.success)) {
        const user = await this.usersRepository.findOne({
          where: { id: result.userId },
          select: ['id', 'email', 'notificationPreferences'],
        });

        if (
          user?.email &&
          user?.notificationPreferences?.eventCancelled !== false
        ) {
          await this.notificationService.queueRefundEmail({
            userId: user.id,
            email: user.email,
            amount: result.amount,
            refundId: result.paymentId,
          });
        }
      }
    }

    // 7. Audit the entire operation
    await this.auditService.log({
      action: 'AUTOMATIC_REFUND_PROCESSING_COMPLETED',
      userId: 'system',
      resourceId: eventId,
      meta: {
        cancellationReason,
        total: confirmedPayments.length,
        successful: successCount,
        failed: failCount,
        skipped: skipCount,
        totalRefunded,
        metadata,
      },
    });

    const executionTimeMs = Date.now() - startTime;

    this.logger.log(
      `Automatic refund processing completed: event=${eventId} ` +
        `success=${successCount} failed=${failCount} skipped=${skipCount} ` +
        `totalRefunded=${totalRefunded} time=${executionTimeMs}ms`,
    );

    return {
      eventId,
      totalRefunds: confirmedPayments.length,
      successfulRefunds: successCount,
      failedRefunds: failCount,
      skippedRefunds: skipCount,
      totalRefundedAmount: totalRefunded,
      currency: confirmedPayments[0]?.currency || 'USD',
      refundResults: results,
      processedAt: new Date(),
      executionTimeMs,
      summary: {
        totalPaymentAmount,
        averageRefundAmount: totalRefunded / (successCount || 1),
        successRate: (successCount / confirmedPayments.length) * 100,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — calculateRefundAmount(dto)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Calculate refund amount for a payment based on event cancellation and policies.
   *
   * This method uses the RefundPolicyService to intelligently determine:
   * - Refund percentage based on cancellation reason
   * - Processing mode (immediate, delayed, manual review)
   * - Any applicable fees or deductions
   * - Store credit or voucher eligibility
   *
   * @param dto Calculation parameters
   * @returns Detailed refund calculation result
   */
  async calculateRefundAmount(dto: CalculateRefundAmountDto) {
    return this.refundPolicyService.calculateRefundAmount(dto);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — handleRefundDispute(createDisputeDto, userId)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * File a refund dispute/chargeback for a payment.
   *
   * Handles user-initiated disputes when they believe a refund was inadequate
   * or when they have additional claims about event cancellation impacts.
   *
   * @param createDisputeDto Dispute details from user
   * @param userId ID of user filing the dispute
   * @returns Created dispute record
   */
  async handleRefundDispute(
    createDisputeDto: CreateRefundDisputeDto,
    userId: string,
  ): Promise<RefundDisputeDto> {
    const { paymentId, reason, description } = createDisputeDto;

    // 1. Verify payment exists and belongs to user
    const payment = await this.paymentsRepository.findOne({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment "${paymentId}" not found.`);
    }

    if (payment.userId !== userId) {
      throw new BadRequestException(
        `Payment does not belong to the requesting user.`,
      );
    }

    // 2. Check if dispute already exists for this payment
    const existingDispute = await this.refundDisputeRepository.findOne({
      where: {
        paymentId,
        status: RefundDisputeStatus.OPEN,
      },
    });

    if (existingDispute) {
      throw new ConflictException(
        `An open dispute already exists for this payment. Dispute ID: ${existingDispute.id}`,
      );
    }

    // 3. Create new dispute record
    const dispute = this.refundDisputeRepository.create({
      paymentId,
      userId,
      reason,
      description,
      requestedAmount: payment.amount,
      currency: payment.currency,
      receivedPartialBenefit: createDisputeDto.receivedPartialBenefit || false,
      benefitPercentage: createDisputeDto.benefitPercentage,
      supportingDocuments: createDisputeDto.supportingDocuments,
      preferredResolution: createDisputeDto.preferredResolution,
      status: RefundDisputeStatus.OPEN,
      metadata: {
        filedAt: new Date().toISOString(),
        paymentStatus: payment.status,
        originalAmount: payment.amount,
      },
    });

    const saved = await this.refundDisputeRepository.save(dispute);

    // 4. Audit the dispute
    await this.auditService.log({
      action: 'REFUND_DISPUTE_FILED',
      userId,
      resourceId: paymentId,
      meta: {
        disputeId: saved.id,
        amount: payment.amount,
        reason,
      },
    });

    this.logger.log(
      `Refund dispute filed: disputeId=${saved.id} paymentId=${paymentId} ` +
        `userId=${userId} amount=${payment.amount}`,
    );

    // 5. Log dispute for admin review (notification handled separately)
    // Admins can query open disputes via API endpoints
    this.logger.log(
      `New refund dispute filed: disputeId=${saved.id} paymentId=${paymentId} ` +
        `userId=${userId}`,
    );

    return this.mapDisputeToDto(saved);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — resolveRefundDispute(disputeId, approved, resolutionNotes, reviewedBy)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Admin method to resolve a refund dispute.
   *
   * @param disputeId ID of the dispute to resolve
   * @param approved Whether the dispute is approved
   * @param approvedAmount Amount to approve for refund
   * @param resolutionNotes Admin notes about the resolution
   * @param reviewedBy Admin user ID
   * @returns Updated dispute record
   */
  async resolveRefundDispute(
    disputeId: string,
    approved: boolean,
    approvedAmount?: number,
    resolutionNotes?: string,
    reviewedBy?: string,
  ): Promise<RefundDisputeDto> {
    const dispute = await this.refundDisputeRepository.findOne({
      where: { id: disputeId },
    });

    if (!dispute) {
      throw new NotFoundException(`Dispute "${disputeId}" not found.`);
    }

    const newStatus = approved
      ? RefundDisputeStatus.APPROVED
      : RefundDisputeStatus.REJECTED;

    dispute.status = newStatus;
    dispute.approvedAmount = approvedAmount ? approvedAmount : null;
    dispute.resolutionNotes = resolutionNotes ? resolutionNotes : null;
    dispute.reviewedBy = reviewedBy ? reviewedBy : null;
    dispute.resolvedAt = new Date();

    const updated = await this.refundDisputeRepository.save(dispute);

    // Audit the resolution
    await this.auditService.log({
      action: 'REFUND_DISPUTE_RESOLVED',
      userId: reviewedBy || 'system',
      resourceId: disputeId,
      meta: {
        approved,
        approvedAmount,
        resolutionNotes,
        paymentId: dispute.paymentId,
      },
    });

    this.logger.log(
      `Refund dispute resolved: disputeId=${disputeId} status=${newStatus} ` +
        `approvedAmount=${approvedAmount}`,
    );

    // If approved, issue the refund
    if (approved && approvedAmount && approvedAmount > 0) {
      await this.issueDisputeRefund(dispute, approvedAmount);
    }

    return this.mapDisputeToDto(updated);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — getDisputeStatus(disputeId)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get status and details of a refund dispute
   */
  async getDisputeStatus(disputeId: string): Promise<RefundDisputeDto> {
    const dispute = await this.refundDisputeRepository.findOne({
      where: { id: disputeId },
    });

    if (!dispute) {
      throw new NotFoundException(`Dispute "${disputeId}" not found.`);
    }

    return this.mapDisputeToDto(dispute);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — getUserDisputes(userId, dto)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get all disputes filed by a user
   */
  async getUserDisputes(userId: string, dto: PaginationDto) {
    const qb = this.refundDisputeRepository
      .createQueryBuilder('dispute')
      .where('dispute.userId = :userId', { userId })
      .orderBy('dispute.createdAt', 'DESC');

    return paginate(qb, dto, 'dispute');
  }

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

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — processAutomaticPaymentRefund
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Process a single refund with automated policy-based amount calculation
   */
  private async processAutomaticPaymentRefund(
    payment: Payment,
    event: Event,
    escrowSecret: string,
    refundAmount: number,
  ): Promise<RefundResultDto> {
    const base: Pick<
      RefundResultDto,
      'paymentId' | 'userId' | 'amount' | 'currency'
    > = {
      paymentId: payment.id,
      userId: payment.userId,
      amount: refundAmount,
      currency: payment.currency,
    };

    try {
      // Validate amount
      if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
        throw new BadRequestException(
          `Computed refund amount is invalid: ${refundAmount}`,
        );
      }

      // Get user and stellar public key
      const user = await this.usersRepository.findOne({
        where: { id: payment.userId },
        select: ['id', 'email', 'stellarPublicKey'],
      });

      if (!user) {
        throw new NotFoundException(`User "${payment.userId}" not found.`);
      }

      if (!user.stellarPublicKey) {
        throw new BadRequestException(
          `User "${payment.userId}" has no Stellar public key on file.`,
        );
      }

      // Send refund to user
      const txResponse = await this.stellarService.sendPayment(
        escrowSecret,
        user.stellarPublicKey,
        String(refundAmount),
        payment.currency,
      );

      const txHash =
        typeof txResponse.hash === 'string' ? txResponse.hash : 'unknown';

      // Update payment status
      payment.status = PaymentStatus.REFUNDED;
      await this.paymentsRepository.save(payment);

      // Update associated ticket
      await this.ticketsRepository.update(
        { eventId: event.id, ownerId: payment.userId },
        { status: 'refunded' },
      );

      // Audit
      await this.auditService.log({
        action: 'AUTOMATIC_REFUND_ISSUED',
        userId: 'system',
        resourceId: payment.id,
        meta: {
          eventId: event.id,
          userId: payment.userId,
          amount: refundAmount,
          currency: payment.currency,
          transactionHash: txHash,
        },
      });

      return {
        ...base,
        success: true,
        transactionHash: txHash,
        processedAt: new Date(),
      };
    } catch (error: unknown) {
      const reason =
        error instanceof Error ? error.message : 'Unknown error';

      await this.auditService.log({
        action: 'AUTOMATIC_REFUND_FAILED',
        userId: 'system',
        resourceId: payment.id,
        meta: { eventId: event.id, reason },
      });

      return { ...base, success: false, error: reason };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — issueDisputeRefund
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Issue refund for an approved dispute
   */
  private async issueDisputeRefund(
    dispute: RefundDispute,
    approvedAmount: number,
  ): Promise<void> {
    try {
      const payment = await this.paymentsRepository.findOne({
        where: { id: dispute.paymentId },
      });

      if (!payment) {
        this.logger.warn(
          `Payment not found for dispute resolution: ${dispute.paymentId}`,
        );
        return;
      }

      const event = await this.eventsRepository.findOne({
        where: { id: payment.eventId },
        select: ['id', 'escrowPublicKey', 'escrowSecretEncrypted'],
      });

      if (!event || !event.escrowPublicKey || !event.escrowSecretEncrypted) {
        this.logger.warn(
          `Event or escrow not found for dispute refund: ${dispute.id}`,
        );
        return;
      }

      const escrowSecret = await this.escrowService.decryptEscrowSecret(
        event.escrowSecretEncrypted,
      );

      const user = await this.usersRepository.findOne({
        where: { id: dispute.userId },
        select: ['id', 'email', 'stellarPublicKey'],
      });

      if (!user?.stellarPublicKey) {
        throw new BadRequestException(
          `User has no Stellar public key on file.`,
        );
      }

      // Send dispute refund
      const txResponse = await this.stellarService.sendPayment(
        escrowSecret,
        user.stellarPublicKey,
        String(approvedAmount),
        dispute.currency,
      );

      const txHash =
        typeof txResponse.hash === 'string' ? txResponse.hash : 'unknown';

      // Update dispute metadata
      dispute.metadata = {
        ...dispute.metadata,
        refundTransactionHash: txHash,
        refundIssuedAt: new Date().toISOString(),
      };
      dispute.status = RefundDisputeStatus.RESOLVED;

      await this.refundDisputeRepository.save(dispute);

      this.logger.log(
        `Dispute refund issued: disputeId=${dispute.id} amount=${approvedAmount} ` +
          `txHash=${txHash}`,
      );
    } catch (error: unknown) {
      const reason =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(
        `Failed to issue dispute refund: disputeId=${dispute.id} reason=${reason}`,
      );

      // Don't throw - log the error but continue
      dispute.metadata = {
        ...dispute.metadata,
        refundError: reason,
      };
      await this.refundDisputeRepository.save(dispute);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — mapDisputeToDto
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Map RefundDispute entity to DTO
   */
  private mapDisputeToDto(dispute: RefundDispute): RefundDisputeDto {
    return {
      id: dispute.id,
      paymentId: dispute.paymentId,
      userId: dispute.userId,
      reason: dispute.reason,
      description: dispute.description,
      status: dispute.status,
      requestedAmount: Number(dispute.requestedAmount),
      approvedAmount: dispute.approvedAmount
        ? Number(dispute.approvedAmount)
        : undefined,
      currency: dispute.currency,
      resolutionNotes: dispute.resolutionNotes || undefined,
      createdAt: dispute.createdAt,
      updatedAt: dispute.updatedAt,
      resolvedAt: dispute.resolvedAt || undefined,
      reviewedBy: dispute.reviewedBy || undefined,
    };
  }
}
