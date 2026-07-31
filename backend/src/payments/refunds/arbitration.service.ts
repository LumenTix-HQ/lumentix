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
import { DisputeArbitration } from './entities/dispute-arbitration.entity';
import { Arbitrator } from './entities/arbitrator.entity';
import { DisputeClaimType } from './enums/dispute-claim-type.enum';
import { ArbitrationVerdict } from './enums/arbitration-verdict.enum';
import { FileDisputeClaimDto } from './dto/file-dispute-claim.dto';
import { AssignArbitratorsDto } from './dto/assign-arbitrators.dto';
import { ResolveDisputeRefundDto } from './dto/resolve-dispute-refund.dto';
import { DisputeArbitrationDto } from './dto/dispute-arbitration.dto';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class DisputeArbitrationService {
  private readonly logger = new Logger(DisputeArbitrationService.name);

  constructor(
    @InjectRepository(DisputeArbitration)
    private readonly arbitrationRepo: Repository<DisputeArbitration>,

    @InjectRepository(Arbitrator)
    private readonly arbitratorRepo: Repository<Arbitrator>,

    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,

    private readonly auditService: AuditService,
  ) {}

  /**
   * File a dispute claim when an event is falsely described or cancelled.
   * The claimant must have a confirmed payment for the event.
   */
  async fileDisputeClaim(
    dto: FileDisputeClaimDto,
    claimantId: string,
  ): Promise<DisputeArbitrationDto> {
    const { paymentId, eventId, claimType, description, evidence } = dto;

    // Verify payment exists and belongs to claimant
    const payment = await this.paymentsRepository.findOne({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new NotFoundException(`Payment "${paymentId}" not found.`);
    }
    if (payment.userId !== claimantId) {
      throw new BadRequestException(
        'Payment does not belong to the requesting user.',
      );
    }

    // Check no open arbitration already exists for this payment
    const existing = await this.arbitrationRepo.findOne({
      where: {
        paymentId,
        status: 'open',
      },
    });
    if (existing) {
      throw new ConflictException(
        `An open arbitration already exists for this payment. ID: ${existing.id}`,
      );
    }

    const arbitration = this.arbitrationRepo.create({
      paymentId,
      claimantId,
      respondentId: dto.respondentId,
      eventId,
      claimType,
      description,
      evidence: evidence || null,
      status: 'open',
      arbitratorIds: [],
      currency: payment.currency,
    });

    const saved = await this.arbitrationRepo.save(arbitration);

    await this.auditService.log({
      action: 'DISPUTE_CLAIM_FILED',
      userId: claimantId,
      resourceId: paymentId,
      meta: {
        arbitrationId: saved.id,
        eventId,
        claimType,
      },
    });

    this.logger.log(
      `Dispute claim filed: id=${saved.id} payment=${paymentId} type=${claimType}`,
    );

    return this.mapToDto(saved);
  }

  /**
   * Assign one or more arbitrators to review a dispute claim.
   * Only open disputes can receive arbitrators.
   */
  async assignDisputeArbitrators(
    dto: AssignArbitratorsDto,
    assignerUserId: string,
  ): Promise<DisputeArbitrationDto> {
    const { disputeId, arbitratorIds } = dto;

    const arbitration = await this.arbitrationRepo.findOne({
      where: { id: disputeId },
    });
    if (!arbitration) {
      throw new NotFoundException(`Dispute arbitration "${disputeId}" not found.`);
    }
    if (arbitration.status !== 'open') {
      throw new BadRequestException(
        `Can only assign arbitrators to open disputes. Current status: ${arbitration.status}`,
      );
    }

    // Verify all arbitrators exist and are active
    for (const arbUserId of arbitratorIds) {
      const arb = await this.arbitratorRepo.findOne({
        where: { userId: arbUserId, isActive: true },
      });
      if (!arb) {
        throw new NotFoundException(
          `Active arbitrator not found for userId "${arbUserId}".`,
        );
      }
    }

    // Merge new arbitrator IDs with existing (avoid duplicates)
    const existingSet = new Set(arbitration.arbitratorIds);
    for (const id of arbitratorIds) {
      existingSet.add(id);
    }
    arbitration.arbitratorIds = Array.from(existingSet);
    arbitration.status = 'assigned';

    const saved = await this.arbitrationRepo.save(arbitration);

    await this.auditService.log({
      action: 'DISPUTE_ARBITRATORS_ASSIGNED',
      userId: assignerUserId,
      resourceId: disputeId,
      meta: {
        arbitratorIds,
      },
    });

    this.logger.log(
      `Arbitrators assigned: dispute=${disputeId} arbitrators=${arbitratorIds.join(',')}`,
    );

    return this.mapToDto(saved);
  }

  /**
   * Resolve a dispute claim with a refund decision based on arbitrator verdict.
   * This transitions the dispute to 'resolved' and can trigger a refund.
   */
  async resolveDisputeRefund(
    disputeId: string,
    dto: ResolveDisputeRefundDto,
    resolverUserId: string,
  ): Promise<DisputeArbitrationDto> {
    const arbitration = await this.arbitrationRepo.findOne({
      where: { id: disputeId },
    });
    if (!arbitration) {
      throw new NotFoundException(`Dispute arbitration "${disputeId}" not found.`);
    }
    if (arbitration.status === 'resolved') {
      throw new ConflictException('This dispute has already been resolved.');
    }

    const { verdict, verdictReason, awardedAmount } = dto;

    arbitration.verdict = verdict;
    arbitration.verdictReason = verdictReason;
    arbitration.resolvedBy = resolverUserId;
    arbitration.resolvedAt = new Date();

    // Determine awarded amount based on verdict
    if (verdict === ArbitrationVerdict.FAVOR_CLAIMANT) {
      // Full refund — use the payment amount; we'll set it when processing
      // We don't have the payment amount here, so fetch it
      const payment = await this.paymentsRepository.findOne({
        where: { id: arbitration.paymentId },
      });
      arbitration.awardedAmount = payment ? Number(payment.amount) : 0;
    } else if (verdict === ArbitrationVerdict.PARTIAL) {
      arbitration.awardedAmount = awardedAmount ?? 0;
    } else {
      // FAVOR_RESPONDENT — no refund
      arbitration.awardedAmount = 0;
    }

    arbitration.status = 'resolved';
    const saved = await this.arbitrationRepo.save(arbitration);

    await this.auditService.log({
      action: 'DISPUTE_RESOLVED',
      userId: resolverUserId,
      resourceId: disputeId,
      meta: {
        verdict,
        awardedAmount: arbitration.awardedAmount,
        paymentId: arbitration.paymentId,
      },
    });

    this.logger.log(
      `Dispute resolved: id=${disputeId} verdict=${verdict} awarded=${arbitration.awardedAmount}`,
    );

    return this.mapToDto(saved);
  }

  /**
   * Get all disputes for a specific user (as claimant)
   */
  async getDisputesForUser(userId: string) {
    return this.arbitrationRepo.find({
      where: { claimantId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get a single dispute by ID
   */
  async getDisputeById(disputeId: string): Promise<DisputeArbitrationDto> {
    const arb = await this.arbitrationRepo.findOne({
      where: { id: disputeId },
    });
    if (!arb) {
      throw new NotFoundException(`Dispute arbitration "${disputeId}" not found.`);
    }
    return this.mapToDto(arb);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private mapToDto(entity: DisputeArbitration): DisputeArbitrationDto {
    return {
      id: entity.id,
      paymentId: entity.paymentId,
      claimantId: entity.claimantId,
      respondentId: entity.respondentId,
      eventId: entity.eventId,
      claimType: entity.claimType as DisputeClaimType,
      description: entity.description,
      evidence: entity.evidence ?? undefined,
      status: entity.status,
      arbitratorIds: entity.arbitratorIds,
      verdict: entity.verdict as ArbitrationVerdict | undefined,
      verdictReason: entity.verdictReason ?? undefined,
      awardedAmount: entity.awardedAmount ? Number(entity.awardedAmount) : undefined,
      currency: entity.currency,
      resolvedBy: entity.resolvedBy ?? undefined,
      resolvedAt: entity.resolvedAt ?? undefined,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}

