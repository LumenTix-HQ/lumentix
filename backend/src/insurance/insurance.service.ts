import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import {
  InsurancePolicyEntity,
  InsurancePolicyStatus,
} from './entities/insurance-policy.entity';
import { PurchaseInsuranceDto } from './dto/purchase-insurance.dto';
import {
  ProcessInsuranceClaimDto,
  CancellationReason,
} from './dto/process-insurance-claim.dto';
import {
  InsurancePolicyDto,
  InsurancePoolDto,
  InsuranceClaimResultDto,
  InsuranceClaimEscalationDto,
  ClaimRuleCheckDto,
  ClaimRuleResultDto,
} from './dto/insurance-policy.dto';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Event, EventStatus } from '../events/entities/event.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { User } from '../users/entities/user.entity';
import { StellarService } from '../stellar/stellar.service';
import { AuditService } from '../audit/audit.service';
import { EscrowService } from '../payments/services/escrow.service';

/** Valid cancellation reasons that qualify for an insurance payout */
const VALID_CLAIM_REASONS = new Set<CancellationReason>([
  CancellationReason.EVENT_CANCELLED_BY_ORGANIZER,
  CancellationReason.FORCE_MAJEURE,
  CancellationReason.VENUE_UNAVAILABLE,
  CancellationReason.ARTIST_PERFORMER_UNAVAILABLE,
  CancellationReason.HEALTH_SAFETY_CONCERNS,
  CancellationReason.GOVERNMENT_RESTRICTION,
  CancellationReason.OTHER,
]);

/**
 * Reasons that, once the event is confirmed cancelled, are paid without human
 * review. Discretionary reasons (force majeure, health & safety, government
 * restriction, other) always go to a reviewer.
 */
export const AUTO_APPROVABLE_REASONS = new Set<CancellationReason>([
  CancellationReason.EVENT_CANCELLED_BY_ORGANIZER,
  CancellationReason.VENUE_UNAVAILABLE,
  CancellationReason.ARTIST_PERFORMER_UNAVAILABLE,
]);

/** Default coverage cap for automatic approval (override with INSURANCE_AUTO_APPROVE_MAX_COVERAGE). */
export const DEFAULT_AUTO_APPROVE_MAX_COVERAGE = 500;

@Injectable()
export class InsuranceService {
  private readonly logger = new Logger(InsuranceService.name);

  constructor(
    @InjectRepository(InsurancePolicyEntity)
    private readonly policyRepo: Repository<InsurancePolicyEntity>,

    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,

    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,

    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly stellarService: StellarService,
    private readonly auditService: AuditService,
    private readonly escrowService: EscrowService,
    private readonly configService: ConfigService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // purchase_insurance
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Purchase insurance for a ticket.
   * Premium = 10% of the ticket price.
   * Provides full refund protection if the event is cancelled.
   *
   * The premium is deducted from the event escrow and tracked in the
   * insurance_policies table. The insurance pool is managed off-chain here
   * and mirrored to the Soroban contract via events.
   */
  async purchaseInsurance(
    userId: string,
    dto: PurchaseInsuranceDto,
  ): Promise<InsurancePolicyDto> {
    // 1. Verify ticket exists and belongs to the requesting user
    const ticket = await this.ticketRepo.findOne({
      where: { id: dto.ticketId },
    });
    if (!ticket) {
      throw new NotFoundException(`Ticket "${dto.ticketId}" not found.`);
    }
    if (ticket.ownerId !== userId) {
      throw new ForbiddenException('You do not own this ticket.');
    }
    if (ticket.status !== 'valid') {
      throw new BadRequestException(
        `Cannot insure a ticket with status "${ticket.status}". Only valid tickets can be insured.`,
      );
    }

    // 2. Check for duplicate policy
    const existing = await this.policyRepo.findOne({
      where: { ticketId: dto.ticketId },
    });
    if (existing) {
      throw new ConflictException(
        `Insurance has already been purchased for ticket "${dto.ticketId}".`,
      );
    }

    // 3. Load the event to calculate the premium
    const event = await this.eventRepo.findOne({
      where: { id: ticket.eventId },
    });
    if (!event) {
      throw new NotFoundException(`Event "${ticket.eventId}" not found.`);
    }
    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException(
        'Cannot purchase insurance for a cancelled event.',
      );
    }
    if (event.status === EventStatus.COMPLETED) {
      throw new BadRequestException(
        'Cannot purchase insurance for a completed event.',
      );
    }

    // 4. Resolve the confirmed payment to get the actual amount paid and currency
    const confirmedPayment = await this.paymentRepo.findOne({
      where: {
        eventId: ticket.eventId,
        userId,
        status: PaymentStatus.CONFIRMED,
        transactionHash: ticket.transactionHash,
      },
    });

    const ticketPrice = confirmedPayment
      ? Number(confirmedPayment.amount)
      : Number(event.ticketPrice);
    const currency = confirmedPayment?.currency ?? event.currency ?? 'XLM';

    // 5. Calculate premium: 10% of ticket price
    const premiumPaid = Math.round(ticketPrice * 0.1 * 1e7) / 1e7; // 7 decimal precision
    if (premiumPaid <= 0) {
      throw new BadRequestException(
        'Ticket price is too low to calculate a valid insurance premium.',
      );
    }

    // 6. Persist the policy
    const policy = this.policyRepo.create({
      ticketId: dto.ticketId,
      eventId: ticket.eventId,
      userId,
      premiumPaid,
      coverageAmount: ticketPrice,
      currency,
      status: InsurancePolicyStatus.ACTIVE,
      claimReason: null,
      premiumTransactionHash: null,
      claimTransactionHash: null,
    });

    const saved = await this.policyRepo.save(policy);

    // 7. Audit log
    await this.auditService.log({
      action: 'INSURANCE_PURCHASED',
      userId,
      resourceId: saved.id,
      meta: {
        ticketId: dto.ticketId,
        eventId: ticket.eventId,
        premiumPaid,
        coverageAmount: ticketPrice,
        currency,
      },
    });

    this.logger.log(
      `Insurance purchased: policyId=${saved.id} ticketId=${dto.ticketId} ` +
        `userId=${userId} premium=${premiumPaid} ${currency} coverage=${ticketPrice}`,
    );

    return this.toDto(saved);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // auto_adjudicate_claim & claim rules
  // ─────────────────────────────────────────────────────────────────────────

  /** Coverage above this is always sent to a human (INSURANCE_AUTO_APPROVE_MAX_COVERAGE). */
  private get autoApproveMaxCoverage(): number {
    const configured = Number(
      this.configService.get<number>('INSURANCE_AUTO_APPROVE_MAX_COVERAGE'),
    );
    return Number.isFinite(configured) && configured >= 0
      ? configured
      : DEFAULT_AUTO_APPROVE_MAX_COVERAGE;
  }

  /**
   * Evaluate a claim against the rule-based criteria. Rules are evaluated in
   * order and every check is reported:
   *  - `reject`  — the claim is invalid (no active policy, event not cancelled,
   *                unknown reason); nothing to review.
   *  - `review`  — a valid claim that needs judgement (a discretionary reason
   *                such as force majeure or "other", or coverage above the
   *                auto-approve cap).
   *  - `approve` — a straightforward cancellation that can be paid automatically.
   * Throws ForbiddenException if the caller does not hold the policy.
   */
  async apply_claim_rules(
    userId: string,
    dto: ProcessInsuranceClaimDto,
  ): Promise<ClaimRuleResultDto & { policy: InsurancePolicyEntity | null }> {
    const checks: ClaimRuleCheckDto[] = [];
    const finish = (
      decision: ClaimRuleResultDto['decision'],
      reason: string | null,
      policy: InsurancePolicyEntity | null,
    ) => ({ decision, reason, checks, policy });

    const policy = await this.policyRepo.findOne({
      where: { ticketId: dto.ticketId },
    });
    checks.push({
      rule: 'policy_exists',
      passed: !!policy,
      detail: policy
        ? `Policy ${policy.id}`
        : `No insurance policy for ticket ${dto.ticketId}`,
    });
    if (!policy)
      return finish('reject', 'No insurance policy covers this ticket.', null);

    if (policy.userId !== userId) {
      throw new ForbiddenException(
        'You are not the holder of this insurance policy.',
      );
    }

    const policyActive = policy.status === InsurancePolicyStatus.ACTIVE;
    checks.push({
      rule: 'policy_active',
      passed: policyActive,
      detail: `Policy status is "${policy.status}"`,
    });
    if (!policyActive) {
      return finish(
        'reject',
        `Policy is not active (status: "${policy.status}").`,
        policy,
      );
    }

    const knownReason = VALID_CLAIM_REASONS.has(dto.cancellationReason);
    checks.push({
      rule: 'reason_recognised',
      passed: knownReason,
      detail: `Cancellation reason "${dto.cancellationReason}"`,
    });
    if (!knownReason) {
      return finish(
        'reject',
        `Unrecognised cancellation reason "${dto.cancellationReason}".`,
        policy,
      );
    }

    const event = await this.eventRepo.findOne({
      where: { id: policy.eventId },
      select: ['id', 'status'],
    });
    const cancelled = event?.status === EventStatus.CANCELLED;
    checks.push({
      rule: 'event_cancelled',
      passed: cancelled,
      detail: event
        ? `Event status is "${event.status}"`
        : `Event ${policy.eventId} not found`,
    });
    if (!cancelled) {
      return finish(
        'reject',
        'Claims are only paid for cancelled events.',
        policy,
      );
    }

    const straightforward = AUTO_APPROVABLE_REASONS.has(dto.cancellationReason);
    checks.push({
      rule: 'reason_auto_approvable',
      passed: straightforward,
      detail: straightforward
        ? `"${dto.cancellationReason}" is a straightforward cancellation`
        : `"${dto.cancellationReason}" needs a reviewer's judgement`,
    });

    const cap = this.autoApproveMaxCoverage;
    const coverage = Number(policy.coverageAmount);
    const withinCap = coverage <= cap;
    checks.push({
      rule: 'coverage_within_auto_approve_cap',
      passed: withinCap,
      detail: `Coverage ${coverage} ${policy.currency} vs cap ${cap}`,
    });

    if (!straightforward) {
      return finish(
        'review',
        `Cancellation reason "${dto.cancellationReason}" requires human review.`,
        policy,
      );
    }
    if (!withinCap) {
      return finish(
        'review',
        `Coverage ${coverage} ${policy.currency} exceeds the auto-approve cap of ${cap}.`,
        policy,
      );
    }
    return finish('approve', null, policy);
  }

  /**
   * Escalate a claim to a human reviewer: the policy moves to `under_review`
   * with the reason recorded, so it appears in the review queue and can no
   * longer be claimed automatically. Escalating an already-escalated policy
   * is a no-op.
   */
  async escalate_to_reviewer(
    policyId: string,
    reason: string,
    cancellationReason: CancellationReason,
    actorId: string,
  ): Promise<InsurancePolicyEntity> {
    const policy = await this.policyRepo.findOne({ where: { id: policyId } });
    if (!policy) {
      throw new NotFoundException(`Insurance policy "${policyId}" not found.`);
    }
    if (policy.status === InsurancePolicyStatus.UNDER_REVIEW) {
      return policy;
    }
    if (policy.status !== InsurancePolicyStatus.ACTIVE) {
      throw new BadRequestException(
        `Only active policies can be escalated (current status: "${policy.status}").`,
      );
    }

    policy.status = InsurancePolicyStatus.UNDER_REVIEW;
    policy.claimReason = cancellationReason;
    policy.escalationReason = reason;
    policy.escalatedAt = new Date();
    const saved = await this.policyRepo.save(policy);

    this.logger.warn(
      `Escalating insurance claim for policy ${policyId} to human reviewer: ${reason}`,
    );
    await this.auditService.log({
      action: 'INSURANCE_CLAIM_ESCALATED',
      userId: actorId,
      resourceId: policyId,
      meta: { reason, cancellationReason, ticketId: policy.ticketId },
    });
    return saved;
  }

  /**
   * Automatically process a claim: straightforward cancellations are paid
   * immediately, edge cases are escalated to a human reviewer, and invalid
   * claims are rejected with the failing rule.
   */
  async auto_adjudicate_claim(
    userId: string,
    dto: ProcessInsuranceClaimDto,
  ): Promise<InsuranceClaimResultDto | InsuranceClaimEscalationDto> {
    const { decision, reason, checks, policy } = await this.apply_claim_rules(
      userId,
      dto,
    );

    if (decision === 'reject' || !policy) {
      throw new BadRequestException(
        reason ?? 'Claim does not meet the insurance criteria.',
      );
    }

    if (decision === 'approve') {
      return this.processInsuranceClaim(userId, dto);
    }

    const escalated = await this.escalate_to_reviewer(
      policy.id,
      reason ?? 'Claim flagged for human review.',
      dto.cancellationReason,
      userId,
    );
    return {
      escalated: true,
      policyId: escalated.id,
      reason: escalated.escalationReason ?? reason ?? '',
      policy: this.toDto(escalated),
      checks,
    };
  }

  /** Claims awaiting a human reviewer, oldest escalation first. */
  async listClaimsUnderReview(): Promise<InsurancePolicyDto[]> {
    const policies = await this.policyRepo.find({
      where: { status: InsurancePolicyStatus.UNDER_REVIEW },
      order: { escalatedAt: 'ASC' },
    });
    return policies.map((p) => this.toDto(p));
  }

  /**
   * A reviewer's decision on an escalated claim. Approval pays the coverage
   * to the policy holder exactly like an automatic approval; rejection closes
   * the claim without payout.
   */
  async reviewEscalatedClaim(
    policyId: string,
    reviewerId: string,
    decision: 'approve' | 'reject',
    note?: string,
  ): Promise<InsuranceClaimResultDto | InsurancePolicyDto> {
    const policy = await this.policyRepo.findOne({ where: { id: policyId } });
    if (!policy) {
      throw new NotFoundException(`Insurance policy "${policyId}" not found.`);
    }
    if (policy.status !== InsurancePolicyStatus.UNDER_REVIEW) {
      throw new BadRequestException(
        `Only claims under review can be decided (current status: "${policy.status}").`,
      );
    }

    policy.reviewedBy = reviewerId;
    policy.reviewedAt = new Date();
    policy.reviewNote = note ?? null;

    if (decision === 'reject') {
      policy.status = InsurancePolicyStatus.CLAIM_REJECTED;
      const saved = await this.policyRepo.save(policy);
      await this.auditService.log({
        action: 'INSURANCE_CLAIM_REJECTED',
        userId: reviewerId,
        resourceId: policy.id,
        meta: { ticketId: policy.ticketId, note: note ?? null },
      });
      return this.toDto(saved);
    }

    return this.payoutClaim(
      policy,
      (policy.claimReason as CancellationReason) ?? CancellationReason.OTHER,
      reviewerId,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // process_insurance_claim
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Process an insurance claim for a cancelled event.
   * Validates the cancellation reason, verifies the event is cancelled,
   * and issues a full refund from the event escrow to the ticket holder.
   */
  async processInsuranceClaim(
    userId: string,
    dto: ProcessInsuranceClaimDto,
  ): Promise<InsuranceClaimResultDto> {
    // 1. Validate the cancellation reason first (fast fail)
    const isValid = await this.validateCancellationReason(
      dto.ticketId,
      dto.cancellationReason,
    );
    if (!isValid) {
      throw new BadRequestException(
        `Cancellation reason "${dto.cancellationReason}" is not valid for an insurance claim.`,
      );
    }

    // 2. Load the policy
    const policy = await this.policyRepo.findOne({
      where: { ticketId: dto.ticketId },
    });
    if (!policy) {
      throw new NotFoundException(
        `No insurance policy found for ticket "${dto.ticketId}".`,
      );
    }

    // 3. Ownership check
    if (policy.userId !== userId) {
      throw new ForbiddenException(
        'You are not the holder of this insurance policy.',
      );
    }

    // 4. Status checks
    if (policy.status !== InsurancePolicyStatus.ACTIVE) {
      throw new BadRequestException(
        `Insurance policy is not active (current status: "${policy.status}"). Cannot process claim.`,
      );
    }

    return this.payoutClaim(policy, dto.cancellationReason, userId);
  }

  /**
   * Pays a policy's coverage from the event escrow to the policy holder and
   * marks it claimed. Shared by direct/automatic claims and reviewer approval;
   * `actorId` is who triggered the payout (holder or reviewer).
   */
  private async payoutClaim(
    policy: InsurancePolicyEntity,
    cancellationReason: CancellationReason,
    actorId: string,
  ): Promise<InsuranceClaimResultDto> {
    const userId = policy.userId;
    const dto = { ticketId: policy.ticketId, cancellationReason };

    // 5. Verify the event is actually cancelled
    const event = await this.eventRepo
      .createQueryBuilder('event')
      .addSelect('event.escrowSecretEncrypted')
      .where('event.id = :id', { id: policy.eventId })
      .getOne();

    if (!event) {
      throw new NotFoundException(`Event "${policy.eventId}" not found.`);
    }
    if (event.status !== EventStatus.CANCELLED) {
      throw new BadRequestException(
        `Insurance claims can only be filed for cancelled events. ` +
          `Current event status: "${event.status}".`,
      );
    }
    if (!event.escrowPublicKey || !event.escrowSecretEncrypted) {
      throw new BadRequestException(
        `Event "${policy.eventId}" has no escrow account configured. Cannot process refund.`,
      );
    }

    // 6. Resolve the claimant's Stellar wallet
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'email', 'stellarPublicKey'],
    });
    if (!user) {
      throw new NotFoundException(`User "${userId}" not found.`);
    }
    if (!user.stellarPublicKey) {
      throw new BadRequestException(
        'You must link a Stellar wallet before filing an insurance claim.',
      );
    }

    // 7. Decrypt escrow secret and send the coverage amount on-chain
    const escrowSecret = await this.escrowService.decryptEscrowSecret(
      event.escrowSecretEncrypted,
    );

    const txResponse = await this.stellarService.sendPayment(
      escrowSecret,
      user.stellarPublicKey,
      String(policy.coverageAmount),
      policy.currency,
    );

    const txHash =
      typeof txResponse.hash === 'string' ? txResponse.hash : 'unknown';

    // 8. Mark policy as claimed
    policy.status = InsurancePolicyStatus.CLAIMED;
    policy.claimReason = dto.cancellationReason;
    policy.claimTransactionHash = txHash;
    const updated = await this.policyRepo.save(policy);

    // 9. Mark the associated ticket as refunded
    await this.ticketRepo.update(
      { id: dto.ticketId },
      { status: 'refunded' },
    );

    // 10. Audit log
    await this.auditService.log({
      action: 'INSURANCE_CLAIM_PROCESSED',
      userId: actorId,
      resourceId: policy.id,
      meta: {
        ticketId: dto.ticketId,
        eventId: policy.eventId,
        cancellationReason: dto.cancellationReason,
        coverageAmount: policy.coverageAmount,
        currency: policy.currency,
        transactionHash: txHash,
        destinationWallet: user.stellarPublicKey,
      },
    });

    this.logger.log(
      `Insurance claim processed: policyId=${policy.id} ticketId=${dto.ticketId} ` +
        `userId=${userId} payout=${policy.coverageAmount} ${policy.currency} txHash=${txHash}`,
    );

    return {
      success: true,
      policy: this.toDto(updated),
      transactionHash: txHash,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // validate_cancellation_reason
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Validate that a cancellation reason qualifies for an insurance payout.
   * Checks:
   *  - The reason is in the set of accepted reasons
   *  - An active policy exists for the ticket
   *  - The associated event is cancelled
   */
  async validateCancellationReason(
    ticketId: string,
    reason: CancellationReason,
  ): Promise<boolean> {
    // All defined reasons are valid — "Other" requires the event to be cancelled
    if (!VALID_CLAIM_REASONS.has(reason)) {
      return false;
    }

    // Verify an active policy exists for this ticket
    const policy = await this.policyRepo.findOne({
      where: { ticketId, status: InsurancePolicyStatus.ACTIVE },
    });
    if (!policy) {
      return false;
    }

    // Verify the event is cancelled
    const event = await this.eventRepo.findOne({
      where: { id: policy.eventId },
      select: ['id', 'status'],
    });
    if (!event || event.status !== EventStatus.CANCELLED) {
      return false;
    }

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get the insurance policy for a specific ticket.
   * The requesting user must own the policy.
   */
  async getInsurancePolicyByTicket(
    ticketId: string,
    requesterId: string,
  ): Promise<InsurancePolicyDto> {
    const policy = await this.policyRepo.findOne({ where: { ticketId } });
    if (!policy) {
      throw new NotFoundException(
        `No insurance policy found for ticket "${ticketId}".`,
      );
    }
    if (policy.userId !== requesterId) {
      throw new ForbiddenException(
        'You do not have access to this insurance policy.',
      );
    }
    return this.toDto(policy);
  }

  /**
   * Get all insurance policies for the requesting user.
   */
  async getMyPolicies(userId: string): Promise<InsurancePolicyDto[]> {
    const policies = await this.policyRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return policies.map((p) => this.toDto(p));
  }

  /**
   * Get aggregate insurance pool statistics.
   */
  async getInsurancePool(): Promise<InsurancePoolDto> {
    const [totalPolicies, totalClaimsProcessed, premiumResult, claimsResult] =
      await Promise.all([
        this.policyRepo.count(),
        this.policyRepo.count({ where: { status: InsurancePolicyStatus.CLAIMED } }),
        this.policyRepo
          .createQueryBuilder('p')
          .select('COALESCE(SUM(p.premiumPaid), 0)', 'total')
          .getRawOne<{ total: string }>(),
        this.policyRepo
          .createQueryBuilder('p')
          .select('COALESCE(SUM(p.coverageAmount), 0)', 'total')
          .where('p.status = :status', { status: InsurancePolicyStatus.CLAIMED })
          .getRawOne<{ total: string }>(),
      ]);

    return {
      totalPolicies,
      totalClaimsProcessed,
      totalPremiumCollected: Number(premiumResult?.total ?? 0),
      totalClaimsPaid: Number(claimsResult?.total ?? 0),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private toDto(policy: InsurancePolicyEntity): InsurancePolicyDto {
    return {
      id: policy.id,
      ticketId: policy.ticketId,
      eventId: policy.eventId,
      userId: policy.userId,
      premiumPaid: Number(policy.premiumPaid),
      coverageAmount: Number(policy.coverageAmount),
      currency: policy.currency,
      status: policy.status,
      claimReason: policy.claimReason,
      escalationReason: policy.escalationReason ?? null,
      escalatedAt: policy.escalatedAt ?? null,
      reviewedBy: policy.reviewedBy ?? null,
      reviewedAt: policy.reviewedAt ?? null,
      reviewNote: policy.reviewNote ?? null,
      premiumTransactionHash: policy.premiumTransactionHash,
      claimTransactionHash: policy.claimTransactionHash,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    };
  }
}
