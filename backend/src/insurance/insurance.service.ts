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
      userId,
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
      premiumTransactionHash: policy.premiumTransactionHash,
      claimTransactionHash: policy.claimTransactionHash,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    };
  }
}
