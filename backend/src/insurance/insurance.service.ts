import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { randomBytes } from 'crypto';

import { Insurer, InsurerStatus } from './entities/insurer.entity';
import { InsuranceProduct } from './entities/insurance-product.entity';
import { InsurancePolicy } from './entities/insurance-policy.entity';
import { InsuranceClaim } from './entities/insurance-claim.entity';

import { PolicyStatus } from './enums/policy-status.enum';
import { ClaimStatus } from './enums/claim-status.enum';
import { InsuranceProductStatus } from './enums/insurance-product-status.enum';

import { RegisterInsurerDto } from './dto/register-insurer.dto';
import { CreateInsuranceProductDto } from './dto/create-insurance-product.dto';
import { UpdateInsuranceProductDto } from './dto/update-insurance-product.dto';
import { ListInsuranceProductsDto } from './dto/list-insurance-products.dto';
import { CompareInsuranceOptionsDto } from './dto/compare-insurance-options.dto';
import { PurchasePolicyDto } from './dto/purchase-policy.dto';
import { ProcessInsuranceClaimDto } from './dto/process-insurance-claim.dto';
import { ReviewClaimDto } from './dto/review-claim.dto';
import { ListClaimsDto } from './dto/list-claims.dto';

import { AuditService } from '../audit/audit.service';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Computed comparison entry returned by compare_insurance_options. */
export interface InsuranceComparisonEntry {
  product: InsuranceProduct;
  insurer: Insurer;
  valueScore: number;        // maxCoverageAmount / premiumAmount ratio
  isEligible: boolean;       // passes attendee + days-before-event checks
  eligibilityReasons: string[];
}
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
    @InjectRepository(Insurer)
    private readonly insurerRepo: Repository<Insurer>,
    @InjectRepository(InsuranceProduct)
    private readonly productRepo: Repository<InsuranceProduct>,
    @InjectRepository(InsurancePolicy)
    private readonly policyRepo: Repository<InsurancePolicy>,
    @InjectRepository(InsuranceClaim)
    private readonly claimRepo: Repository<InsuranceClaim>,
    private readonly auditService: AuditService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // INSURER MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  /** Register a new insurer profile for the authenticated user. */
  async registerInsurer(dto: RegisterInsurerDto, userId: string): Promise<Insurer> {
    const existing = await this.insurerRepo.findOne({ where: { userId } });
    if (existing) {
      throw new ConflictException('You already have an insurer profile registered.');
    }

    const licenseConflict = await this.insurerRepo.findOne({
      where: { licenseNumber: dto.licenseNumber },
    });
    if (licenseConflict) {
      throw new ConflictException('An insurer with this license number already exists.');
    }

    const insurer = this.insurerRepo.create({ ...dto, userId });
    const saved = await this.insurerRepo.save(insurer);

    await this.auditService.log({
      action: 'INSURER_REGISTERED',
      userId,
      resourceId: saved.id,
      meta: { companyName: saved.companyName },
    });

    return saved;
  }

  /** Admin: approve or suspend an insurer. */
  async updateInsurerStatus(
    insurerId: string,
    status: InsurerStatus,
    adminUserId: string,
  ): Promise<Insurer> {
    const insurer = await this.findInsurerOrFail(insurerId);
    insurer.status = status;
    const saved = await this.insurerRepo.save(insurer);

    await this.auditService.log({
      action: 'INSURER_STATUS_UPDATED',
      userId: adminUserId,
      resourceId: insurerId,
      meta: { newStatus: status },
    });

    return saved;
  }

  async getInsurer(insurerId: string): Promise<Insurer> {
    return this.findInsurerOrFail(insurerId);
  }

  async getMyInsurerProfile(userId: string): Promise<Insurer> {
    const insurer = await this.insurerRepo.findOne({ where: { userId } });
    if (!insurer) {
      throw new NotFoundException('No insurer profile found for this account.');
    }
    return insurer;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INSURANCE PRODUCTS  (list_insurance_product)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * list_insurance_product — browse and filter marketplace products.
   * Public endpoint: no auth required to view active products.
   */
  async listInsuranceProducts(
    dto: ListInsuranceProductsDto,
  ): Promise<PaginatedResult<InsuranceProduct>> {
    const {
      coverageType,
      status,
      insurerId,
      search,
      premiumMin,
      premiumMax,
      attendeeCount,
      daysBeforeEvent,
      sortBy = 'createdAt',
      order = 'DESC',
      page = 1,
      limit = 10,
    } = dto;

    const allowedSortFields: Record<string, string> = {
      premiumAmount: 'product.premiumAmount',
      maxCoverageAmount: 'product.maxCoverageAmount',
      totalPoliciesSold: 'product.totalPoliciesSold',
      createdAt: 'product.createdAt',
    };
    const sortField = allowedSortFields[sortBy] ?? 'product.createdAt';

    const qb: SelectQueryBuilder<InsuranceProduct> = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.insurer', 'insurer');

    // Default to showing only active products unless a status filter is given
    if (status) {
      qb.andWhere('product.status = :status', { status });
    } else {
      qb.andWhere('product.status = :status', {
        status: InsuranceProductStatus.ACTIVE,
      });
    }

    if (coverageType) {
      qb.andWhere('product.coverageType = :coverageType', { coverageType });
    }
    if (insurerId) {
      qb.andWhere('product.insurerId = :insurerId', { insurerId });
    }
    if (search) {
      qb.andWhere('LOWER(product.name) LIKE LOWER(:search)', {
        search: `%${search}%`,
      });
    }
    if (premiumMin !== undefined) {
      qb.andWhere('product.premiumAmount >= :premiumMin', { premiumMin });
    }
    if (premiumMax !== undefined) {
      qb.andWhere('product.premiumAmount <= :premiumMax', { premiumMax });
    }
    if (attendeeCount !== undefined) {
      qb.andWhere(
        '(product.maxAttendeesSupported IS NULL OR product.maxAttendeesSupported >= :attendeeCount)',
        { attendeeCount },
      );
    }
    if (daysBeforeEvent !== undefined) {
      qb.andWhere('product.minDaysBeforeEvent <= :daysBeforeEvent', {
        daysBeforeEvent,
      });
    }

    // Only show products from APPROVED insurers in marketplace listings
    qb.andWhere('insurer.status = :insurerStatus', {
      insurerStatus: InsurerStatus.APPROVED,
    });

    qb.orderBy(sortField, order as 'ASC' | 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getInsuranceProduct(productId: string): Promise<InsuranceProduct> {
    const product = await this.productRepo.findOne({
      where: { id: productId },
      relations: ['insurer'],
    });
    if (!product) {
      throw new NotFoundException(`Insurance product "${productId}" not found.`);
    }
    return product;
  }

  /** Insurer: create a new product (starts in DRAFT). */
  async createInsuranceProduct(
    dto: CreateInsuranceProductDto,
    userId: string,
  ): Promise<InsuranceProduct> {
    const insurer = await this.requireApprovedInsurer(userId);

    const product = this.productRepo.create({
      ...dto,
      currency: dto.currency ?? 'USD',
      coverageTerms: dto.coverageTerms ?? {},
      minDaysBeforeEvent: dto.minDaysBeforeEvent ?? 0,
      insurerId: insurer.id,
      status: InsuranceProductStatus.DRAFT,
    });

    const saved = await this.productRepo.save(product);

    await this.auditService.log({
      action: 'INSURANCE_PRODUCT_CREATED',
      userId,
      resourceId: saved.id,
      meta: { name: saved.name, coverageType: saved.coverageType },
    });

    return saved;
  }

  /** Insurer: update own product details or change status. */
  async updateInsuranceProduct(
    productId: string,
    dto: UpdateInsuranceProductDto,
    userId: string,
  ): Promise<InsuranceProduct> {
    const product = await this.requireOwnProduct(productId, userId);
    Object.assign(product, dto);
    const saved = await this.productRepo.save(product);

    await this.auditService.log({
      action: 'INSURANCE_PRODUCT_UPDATED',
      userId,
      resourceId: productId,
      meta: { changes: Object.keys(dto) },
    });

    return saved;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COMPARE  (compare_insurance_options)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * compare_insurance_options — side-by-side analysis of 2–5 products.
   * Returns each product enriched with a value score and eligibility flags.
   * Optionally checks eligibility against a real event when eventId is provided.
   */
  async compareInsuranceOptions(
    dto: CompareInsuranceOptionsDto,
  ): Promise<InsuranceComparisonEntry[]> {
    const products = await this.productRepo.find({
      where: dto.productIds.map((id) => ({ id })),
      relations: ['insurer'],
    });

    if (products.length !== dto.productIds.length) {
      const foundIds = products.map((p) => p.id);
      const missing = dto.productIds.filter((id) => !foundIds.includes(id));
      throw new NotFoundException(
        `Products not found: ${missing.join(', ')}`,
      );
    }

    // Optionally fetch event for eligibility checks
    let eventDaysAway: number | null = null;
    if (dto.eventId) {
      // We do a lightweight raw query rather than injecting EventsService
      // to avoid circular module dependencies.
      const raw = await this.productRepo.manager.query(
        `SELECT "startDate" FROM events WHERE id = $1 LIMIT 1`,
        [dto.eventId],
      );
      if (raw.length > 0) {
        const startDate = new Date(raw[0].startDate as string);
        eventDaysAway = Math.floor(
          (startDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );
      }
    }

    return products.map((product) => {
      const eligibilityReasons: string[] = [];
      let isEligible = true;

      // Check insurer status
      if (product.insurer.status !== InsurerStatus.APPROVED) {
        isEligible = false;
        eligibilityReasons.push('Insurer is not currently approved on the marketplace.');
      }

      // Check product status
      if (product.status !== InsuranceProductStatus.ACTIVE) {
        isEligible = false;
        eligibilityReasons.push(`Product is ${product.status}, not active.`);
      }

      // Check attendee count compatibility
      if (
        dto.attendeeCount !== undefined &&
        product.maxAttendeesSupported !== null &&
        dto.attendeeCount > product.maxAttendeesSupported
      ) {
        isEligible = false;
        eligibilityReasons.push(
          `Product supports up to ${product.maxAttendeesSupported} attendees; event has ${dto.attendeeCount}.`,
        );
      }

      // Check days-before-event requirement
      if (eventDaysAway !== null && eventDaysAway < product.minDaysBeforeEvent) {
        isEligible = false;
        eligibilityReasons.push(
          `Must be purchased at least ${product.minDaysBeforeEvent} days before the event (${eventDaysAway} days remaining).`,
        );
      }

      // Value score: coverage bang-per-buck ratio (capped at 9999 for display)
      const premium = Number(product.premiumAmount);
      const coverage = Number(product.maxCoverageAmount);
      const valueScore =
        premium > 0 ? Math.min(Math.round((coverage / premium) * 10) / 10, 9999) : 0;

      return { product, insurer: product.insurer, valueScore, isEligible, eligibilityReasons };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POLICIES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Purchase a policy for a given event.
   * If paymentTxHash is provided the policy is immediately activated;
   * otherwise it sits in PENDING_PAYMENT until confirmed separately.
   */
  async purchasePolicy(dto: PurchasePolicyDto, userId: string): Promise<InsurancePolicy> {
    const product = await this.productRepo.findOne({
      where: { id: dto.productId },
      relations: ['insurer'],
    });
    if (!product) {
      throw new NotFoundException(`Insurance product "${dto.productId}" not found.`);
    }
    if (product.status !== InsuranceProductStatus.ACTIVE) {
      throw new BadRequestException(
        `Product "${product.name}" is not currently available for purchase.`,
      );
    }
    if (product.insurer.status !== InsurerStatus.APPROVED) {
      throw new BadRequestException('This insurer is not currently approved.');
    }

    // Prevent duplicate active policies for the same user+product+event
    const duplicate = await this.policyRepo.findOne({
      where: {
        userId,
        productId: dto.productId,
        eventId: dto.eventId,
        status: PolicyStatus.ACTIVE,
      },
    });
    if (duplicate) {
      throw new ConflictException(
        'You already hold an active policy for this product and event.',
      );
    }

    // Fetch event dates for coverage window
    const eventRows = await this.policyRepo.manager.query(
      `SELECT "startDate", "endDate", "maxAttendees" FROM events WHERE id = $1 LIMIT 1`,
      [dto.eventId],
    );
    if (!eventRows.length) {
      throw new NotFoundException(`Event "${dto.eventId}" not found.`);
    }
    const event = eventRows[0] as {
      startDate: string;
      endDate: string;
      maxAttendees: number | null;
    };

    // Enforce minDaysBeforeEvent
    const daysAway = Math.floor(
      (new Date(event.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (daysAway < product.minDaysBeforeEvent) {
      throw new BadRequestException(
        `This product must be purchased at least ${product.minDaysBeforeEvent} day(s) before the event.`,
      );
    }

    // Enforce maxAttendeesSupported
    if (
      product.maxAttendeesSupported !== null &&
      event.maxAttendees !== null &&
      event.maxAttendees > product.maxAttendeesSupported
    ) {
      throw new BadRequestException(
        `This product supports events with up to ${product.maxAttendeesSupported} attendees.`,
      );
    }

    const policyNumber = this.generatePolicyNumber();
    const isActivated = !!dto.paymentTxHash;

    const policy = this.policyRepo.create({
      userId,
      eventId: dto.eventId,
      productId: product.id,
      premiumPaid: product.premiumAmount,
      currency: product.currency,
      status: isActivated ? PolicyStatus.ACTIVE : PolicyStatus.PENDING_PAYMENT,
      effectiveFrom: isActivated ? new Date() : null,
      effectiveTo: isActivated ? new Date(event.endDate) : null,
      policyNumber,
      paymentTxHash: dto.paymentTxHash ?? null,
      coverageSnapshot: {
        coverageType: product.coverageType,
        maxCoverageAmount: product.maxCoverageAmount,
        ...product.coverageTerms,
      },
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

    // Increment product counter (non-blocking)
    this.productRepo
      .increment({ id: product.id }, 'totalPoliciesSold', 1)
      .catch(() => undefined);

    await this.auditService.log({
      action: 'INSURANCE_POLICY_PURCHASED',
      userId,
      resourceId: saved.id,
      meta: {
        productId: product.id,
        eventId: dto.eventId,
        status: saved.status,
        policyNumber,
      },
    });

    return saved;
  }

  /** Confirm payment for a PENDING_PAYMENT policy. */
  async confirmPolicyPayment(
    policyId: string,
    txHash: string,
    userId: string,
  ): Promise<InsurancePolicy> {
    const policy = await this.findPolicyOrFail(policyId);

    if (policy.userId !== userId) {
      throw new ForbiddenException('You do not own this policy.');
    }
    if (policy.status !== PolicyStatus.PENDING_PAYMENT) {
      throw new BadRequestException(`Policy is already ${policy.status}.`);
    }

    // Fetch event end date for coverage window
    const eventRows = await this.policyRepo.manager.query(
      `SELECT "endDate" FROM events WHERE id = $1 LIMIT 1`,
      [policy.eventId],
    );

    policy.status = PolicyStatus.ACTIVE;
    policy.paymentTxHash = txHash;
    policy.effectiveFrom = new Date();
    policy.effectiveTo = eventRows.length ? new Date(eventRows[0].endDate as string) : null;

    const saved = await this.policyRepo.save(policy);

    await this.auditService.log({
      action: 'INSURANCE_POLICY_ACTIVATED',
      userId,
      resourceId: policyId,
      meta: { txHash },
    });

    return saved;
  }

  async listMyPolicies(userId: string, page = 1, limit = 10): Promise<PaginatedResult<InsurancePolicy>> {
    const [data, total] = await this.policyRepo.findAndCount({
      where: { userId },
      relations: ['product', 'product.insurer'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getPolicyById(policyId: string, userId: string): Promise<InsurancePolicy> {
    const policy = await this.findPolicyOrFail(policyId);
    if (policy.userId !== userId) {
      throw new ForbiddenException('You do not have access to this policy.');
    }
    return policy;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CLAIMS  (process_insurance_claim)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * process_insurance_claim — submit a claim against an active policy.
   * Validates ownership, policy status, and that requestedAmount ≤ maxCoverageAmount.
   */
  async processInsuranceClaim(
    dto: ProcessInsuranceClaimDto,
    userId: string,
  ): Promise<InsuranceClaim> {
    const policy = await this.findPolicyOrFail(dto.policyId);

    if (policy.userId !== userId) {
      throw new ForbiddenException('You do not own this policy.');
    }
    if (policy.status !== PolicyStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot file a claim against a policy with status "${policy.status}".`,
      );
    }

    // Check policy coverage window
    const now = new Date();
    if (policy.effectiveTo && now > policy.effectiveTo) {
      throw new BadRequestException('This policy has expired and no longer accepts claims.');
    }

    // Fetch max coverage from snapshot
    const maxCoverage = Number(
      (policy.coverageSnapshot as Record<string, unknown>)['maxCoverageAmount'] ?? 0,
    );
    if (maxCoverage > 0 && dto.requestedAmount > maxCoverage) {
      throw new BadRequestException(
        `Requested amount (${dto.requestedAmount}) exceeds maximum coverage (${maxCoverage}).`,
      );
    }

    // Prevent a second open claim on the same policy
    const openClaim = await this.claimRepo.findOne({
      where: [
        { policyId: dto.policyId, status: ClaimStatus.SUBMITTED },
        { policyId: dto.policyId, status: ClaimStatus.UNDER_REVIEW },
      ],
    });
    if (openClaim) {
      throw new ConflictException(
        'There is already an open claim for this policy. Wait for it to be resolved.',
      );
    }

    const claim = this.claimRepo.create({
      policyId: dto.policyId,
      claimantUserId: userId,
      description: dto.description,
      requestedAmount: dto.requestedAmount,
      evidenceUrls: dto.evidenceUrls ?? [],
      status: ClaimStatus.SUBMITTED,
    });

    const saved = await this.claimRepo.save(claim);

    // Mark the policy as CLAIMED so no second active claim window opens
    policy.status = PolicyStatus.CLAIMED;
    await this.policyRepo.save(policy);

    await this.auditService.log({
      action: 'INSURANCE_CLAIM_SUBMITTED',
      userId,
      resourceId: saved.id,
      meta: { policyId: dto.policyId, requestedAmount: dto.requestedAmount },
    });

    return saved;
  }

  /**
   * Insurer: review a submitted claim — approve or reject it.
   */
  async reviewClaim(
    claimId: string,
    dto: ReviewClaimDto,
    reviewerUserId: string,
  ): Promise<InsuranceClaim> {
    const claim = await this.findClaimOrFail(claimId);

    if (
      claim.status !== ClaimStatus.SUBMITTED &&
      claim.status !== ClaimStatus.UNDER_REVIEW
    ) {
      throw new BadRequestException(
        `Claim is already in "${claim.status}" state and cannot be reviewed.`,
      );
    }

    // Verify the reviewer belongs to the insurer that issued the product
    await this.requireInsurerOwnsPolicy(reviewerUserId, claim.policyId);

    if (dto.decision === ClaimStatus.APPROVED) {
      if (dto.approvedAmount === undefined) {
        throw new BadRequestException('approvedAmount is required when approving a claim.');
      }
      claim.approvedAmount = dto.approvedAmount;
      claim.status = ClaimStatus.APPROVED;
    } else {
      claim.status = ClaimStatus.REJECTED;
    }

    claim.reviewNotes = dto.reviewNotes ?? null;
    claim.reviewedByUserId = reviewerUserId;
    claim.reviewedAt = new Date();

    const saved = await this.claimRepo.save(claim);

    await this.auditService.log({
      action: 'INSURANCE_CLAIM_REVIEWED',
      userId: reviewerUserId,
      resourceId: claimId,
      meta: { decision: dto.decision, approvedAmount: dto.approvedAmount },
    });

    return saved;
  }

  /** Insurer: mark an approved claim as paid and record the payout tx. */
  async markClaimPaid(
    claimId: string,
    payoutTxHash: string,
    reviewerUserId: string,
  ): Promise<InsuranceClaim> {
    const claim = await this.findClaimOrFail(claimId);

    if (claim.status !== ClaimStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED claims can be marked as paid.');
    }

    await this.requireInsurerOwnsPolicy(reviewerUserId, claim.policyId);

    claim.status = ClaimStatus.PAID;
    claim.payoutTxHash = payoutTxHash;
    const saved = await this.claimRepo.save(claim);

    // Update insurer statistics (non-blocking)
    const policy = await this.policyRepo.findOne({ where: { id: claim.policyId }, relations: ['product'] });
    if (policy?.product?.insurerId) {
      this.insurerRepo
        .increment({ id: policy.product.insurerId }, 'totalClaimsPaid', 1)
        .catch(() => undefined);
    }

    await this.auditService.log({
      action: 'INSURANCE_CLAIM_PAID',
      userId: reviewerUserId,
      resourceId: claimId,
      meta: { payoutTxHash },
    });

    return saved;
  }

  async listClaims(
    dto: ListClaimsDto,
    requesterId: string,
    isInsurer: boolean,
  ): Promise<PaginatedResult<InsuranceClaim>> {
    const { status, policyId, claimantUserId, page = 1, limit = 10 } = dto;

    const qb = this.claimRepo
      .createQueryBuilder('claim')
      .leftJoinAndSelect('claim.policy', 'policy')
      .leftJoinAndSelect('policy.product', 'product')
      .leftJoinAndSelect('product.insurer', 'insurer');

    // Non-insurer users can only see their own claims
    if (!isInsurer) {
      qb.andWhere('claim.claimantUserId = :requesterId', { requesterId });
    } else if (claimantUserId) {
      qb.andWhere('claim.claimantUserId = :claimantUserId', { claimantUserId });
    }

    if (status) qb.andWhere('claim.status = :status', { status });
    if (policyId) qb.andWhere('claim.policyId = :policyId', { policyId });

    qb.orderBy('claim.createdAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getClaimById(claimId: string, userId: string, isInsurer: boolean): Promise<InsuranceClaim> {
    const claim = await this.findClaimOrFail(claimId);

    if (!isInsurer && claim.claimantUserId !== userId) {
      throw new ForbiddenException('You do not have access to this claim.');
    }

    return claim;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private async findInsurerOrFail(insurerId: string): Promise<Insurer> {
    const insurer = await this.insurerRepo.findOne({ where: { id: insurerId } });
    if (!insurer) throw new NotFoundException(`Insurer "${insurerId}" not found.`);
    return insurer;
  }

  private async findPolicyOrFail(policyId: string): Promise<InsurancePolicy> {
    const policy = await this.policyRepo.findOne({
      where: { id: policyId },
      relations: ['product'],
    });
    if (!policy) throw new NotFoundException(`Policy "${policyId}" not found.`);
    return policy;
  }

  private async findClaimOrFail(claimId: string): Promise<InsuranceClaim> {
    const claim = await this.claimRepo.findOne({
      where: { id: claimId },
      relations: ['policy', 'policy.product'],
    });
    if (!claim) throw new NotFoundException(`Claim "${claimId}" not found.`);
    return claim;
  }

  /** Resolve the insurer for a given userId and verify it is APPROVED. */
  private async requireApprovedInsurer(userId: string): Promise<Insurer> {
    const insurer = await this.insurerRepo.findOne({ where: { userId } });
    if (!insurer) {
      throw new ForbiddenException('You do not have an insurer profile.');
    }
    if (insurer.status !== InsurerStatus.APPROVED) {
      throw new ForbiddenException(
        `Your insurer account status is "${insurer.status}". Only approved insurers can manage products.`,
      );
    }
    return insurer;
  }

  /** Verify the userId owns the product (via their insurer profile). */
  private async requireOwnProduct(
    productId: string,
    userId: string,
  ): Promise<InsuranceProduct> {
    const insurer = await this.insurerRepo.findOne({ where: { userId } });
    if (!insurer) throw new ForbiddenException('No insurer profile found.');

    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException(`Product "${productId}" not found.`);
    if (product.insurerId !== insurer.id) {
      throw new ForbiddenException('You do not own this product.');
    }
    return product;
  }

  /**
   * Verify that the reviewer's insurer profile is the one that issued
   * the product linked to this policy.
   */
  private async requireInsurerOwnsPolicy(reviewerUserId: string, policyId: string): Promise<void> {
    const insurer = await this.insurerRepo.findOne({ where: { userId: reviewerUserId } });
    if (!insurer) throw new ForbiddenException('No insurer profile found.');

    const policy = await this.policyRepo.findOne({
      where: { id: policyId },
      relations: ['product'],
    });
    if (!policy) throw new NotFoundException(`Policy "${policyId}" not found.`);

    if (policy.product.insurerId !== insurer.id) {
      throw new ForbiddenException('You are not the insurer for this policy.');
    }
  }

  /** Generate a human-readable policy number: LX-INS-<timestamp>-<random4>. */
  private generatePolicyNumber(): string {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = randomBytes(2).toString('hex').toUpperCase();
    return `LX-INS-${ts}-${rand}`;
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

  /**
   * Apply rule-based criteria to determine if an insurance claim can be auto-adjudicated.
   * Straightforward event cancellations are auto-approved, while edge cases require human reviewer.
   */
  async apply_claim_rules(
    ticketId: string,
    cancellationReason: CancellationReason,
  ): Promise<{ autoApprove: boolean; reason?: string; requiresReview: boolean }> {
    const isValid = await this.validateCancellationReason(ticketId, cancellationReason);
    if (!isValid) {
      return {
        autoApprove: false,
        reason: `Invalid cancellation reason "${cancellationReason}" or inactive policy/event.`,
        requiresReview: true,
      };
    }

    const AUTO_APPROVED_REASONS = new Set<CancellationReason>([
      CancellationReason.EVENT_CANCELLED,
      CancellationReason.ORGANIZER_CANCELLATION,
      CancellationReason.WEATHER,
    ]);

    if (AUTO_APPROVED_REASONS.has(cancellationReason)) {
      return { autoApprove: true, requiresReview: false };
    }

    return {
      autoApprove: false,
      reason: `Cancellation reason "${cancellationReason}" requires human reviewer evaluation.`,
      requiresReview: true,
    };
  }

  /**
   * Escalate an edge-case insurance claim to a human reviewer.
   */
  async escalate_to_reviewer(
    policyId: string,
    reason: string,
  ): Promise<{ escalated: boolean; policyId: string; reason: string }> {
    this.logger.warn(`Escalating insurance claim for policy ${policyId} to human reviewer: ${reason}`);
    await this.auditService.log({
      action: 'INSURANCE_CLAIM_ESCALATED',
      resourceId: policyId,
      meta: { reason },
    });
    return { escalated: true, policyId, reason };
  }

  /**
   * Automatically process straightforward insurance claims using rule-based criteria before escalating edge cases.
   */
  async auto_adjudicate_claim(
    userId: string,
    dto: ProcessInsuranceClaimDto,
  ): Promise<InsuranceClaimResultDto | { escalated: boolean; policyId: string; reason: string }> {
    const ruleResult = await this.apply_claim_rules(dto.ticketId, dto.cancellationReason);

    if (ruleResult.autoApprove) {
      return this.processInsuranceClaim(userId, dto);
    }

    const policy = await this.policyRepo.findOne({ where: { ticketId: dto.ticketId } });
    const policyId = policy?.id ?? dto.ticketId;

    return this.escalate_to_reviewer(
      policyId,
      ruleResult.reason ?? 'Claim criteria flagged for human reviewer evaluation',
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
