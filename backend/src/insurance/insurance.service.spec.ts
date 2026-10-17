import { Test, TestingModule } from '@nestjs/testing';
import { InsuranceService } from './insurance.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InsurancePolicyEntity, InsurancePolicyStatus } from './entities/insurance-policy.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Event, EventStatus } from '../events/entities/event.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { User } from '../users/entities/user.entity';
import { StellarService } from '../stellar/stellar.service';
import { AuditService } from '../audit/audit.service';
import { EscrowService } from '../payments/services/escrow.service';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { CancellationReason } from './dto/process-insurance-claim.dto';

describe('InsuranceService', () => {
  let service: InsuranceService;
  let mockPolicyRepo: any;
  let mockTicketRepo: any;
  let mockEventRepo: any;
  let mockPaymentRepo: any;
  let mockUserRepo: any;
  let mockStellarService: any;
  let mockAuditService: any;
  let mockEscrowService: any;

  beforeEach(async () => {
    mockPolicyRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((dto) => ({ ...dto, id: 'pol1', createdAt: new Date(), updatedAt: new Date() })),
      save: jest.fn((p) => Promise.resolve(p)),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
      })),
    };
    mockTicketRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };
    mockEventRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
      })),
    };
    mockPaymentRepo = { findOne: jest.fn() };
    mockUserRepo = { findOne: jest.fn() };
    mockStellarService = { sendPayment: jest.fn().mockResolvedValue({ hash: 'tx123' }) };
    mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };
    mockEscrowService = { decryptEscrowSecret: jest.fn().mockResolvedValue('secret') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsuranceService,
        { provide: getRepositoryToken(InsurancePolicyEntity), useValue: mockPolicyRepo },
        { provide: getRepositoryToken(TicketEntity), useValue: mockTicketRepo },
        { provide: getRepositoryToken(Event), useValue: mockEventRepo },
        { provide: getRepositoryToken(Payment), useValue: mockPaymentRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: StellarService, useValue: mockStellarService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: EscrowService, useValue: mockEscrowService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<InsuranceService>(InsuranceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('purchaseInsurance', () => {
    it('should throw NotFoundException when ticket not found', async () => {
      mockTicketRepo.findOne.mockResolvedValue(null);

      await expect(
        service.purchaseInsurance('u1', { ticketId: 't1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user does not own ticket', async () => {
      mockTicketRepo.findOne.mockResolvedValue({ id: 't1', ownerId: 'other', status: 'valid' });

      await expect(
        service.purchaseInsurance('u1', { ticketId: 't1' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when ticket is not valid', async () => {
      mockTicketRepo.findOne.mockResolvedValue({ id: 't1', ownerId: 'u1', status: 'refunded' });

      await expect(
        service.purchaseInsurance('u1', { ticketId: 't1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when policy already exists', async () => {
      mockTicketRepo.findOne.mockResolvedValue({ id: 't1', ownerId: 'u1', status: 'valid', eventId: 'e1' });
      mockPolicyRepo.findOne.mockResolvedValue({ id: 'existing' });

      await expect(
        service.purchaseInsurance('u1', { ticketId: 't1' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('validateCancellationReason', () => {
    it('should return false for invalid reason', async () => {
      const result = await service.validateCancellationReason('t1', 'invalid_reason' as any);
      expect(result).toBe(false);
    });
  });

  describe('getInsurancePool', () => {
    it('should return pool statistics', async () => {
      const result = await service.getInsurancePool();

      expect(result.totalPolicies).toBe(0);
      expect(result.totalPremiumCollected).toBe(0);
    });
  });

  // ── auto-adjudication (#1432) ─────────────────────────────────────────────

  describe('auto-adjudication', () => {
    const claim = (cancellationReason: CancellationReason) => ({
      ticketId: 't1',
      cancellationReason,
    });
    const activePolicy = (overrides: Record<string, unknown> = {}) => ({
      id: 'pol1',
      ticketId: 't1',
      eventId: 'e1',
      userId: 'u1',
      coverageAmount: 100,
      currency: 'XLM',
      status: InsurancePolicyStatus.ACTIVE,
      claimReason: null,
      ...overrides,
    });
    const cancelledEvent = { id: 'e1', status: EventStatus.CANCELLED };

    function payoutReady() {
      const qb = {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          ...cancelledEvent,
          escrowPublicKey: 'GESCROW',
          escrowSecretEncrypted: 'enc',
        }),
      };
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);
      mockUserRepo.findOne.mockResolvedValue({
        id: 'u1',
        stellarPublicKey: 'GHOLDER',
      });
    }

    describe('apply_claim_rules', () => {
      it('approves a straightforward cancellation within the coverage cap', async () => {
        mockPolicyRepo.findOne.mockResolvedValue(activePolicy());
        mockEventRepo.findOne.mockResolvedValue(cancelledEvent);

        const result = await service.apply_claim_rules(
          'u1',
          claim(CancellationReason.EVENT_CANCELLED_BY_ORGANIZER),
        );

        expect(result.decision).toBe('approve');
        expect(result.checks.every((c) => c.passed)).toBe(true);
      });

      it.each([
        CancellationReason.FORCE_MAJEURE,
        CancellationReason.HEALTH_SAFETY_CONCERNS,
        CancellationReason.GOVERNMENT_RESTRICTION,
        CancellationReason.OTHER,
      ])('sends discretionary reason %s to review', async (reason) => {
        mockPolicyRepo.findOne.mockResolvedValue(activePolicy());
        mockEventRepo.findOne.mockResolvedValue(cancelledEvent);

        const result = await service.apply_claim_rules('u1', claim(reason));

        expect(result.decision).toBe('review');
        expect(
          result.checks.find((c) => c.rule === 'reason_auto_approvable')
            ?.passed,
        ).toBe(false);
      });

      it('sends coverage above the configured cap to review', async () => {
        const config = (service as any).configService;
        config.get.mockImplementation((key: string) =>
          key === 'INSURANCE_AUTO_APPROVE_MAX_COVERAGE' ? 50 : undefined,
        );
        mockPolicyRepo.findOne.mockResolvedValue(
          activePolicy({ coverageAmount: 75 }),
        );
        mockEventRepo.findOne.mockResolvedValue(cancelledEvent);

        const result = await service.apply_claim_rules(
          'u1',
          claim(CancellationReason.VENUE_UNAVAILABLE),
        );

        expect(result.decision).toBe('review');
        expect(result.reason).toMatch(/exceeds the auto-approve cap of 50/);
      });

      it('rejects when the event is not cancelled', async () => {
        mockPolicyRepo.findOne.mockResolvedValue(activePolicy());
        mockEventRepo.findOne.mockResolvedValue({
          id: 'e1',
          status: EventStatus.PUBLISHED,
        });

        const result = await service.apply_claim_rules(
          'u1',
          claim(CancellationReason.EVENT_CANCELLED_BY_ORGANIZER),
        );

        expect(result.decision).toBe('reject');
      });

      it('rejects when the policy is not active', async () => {
        mockPolicyRepo.findOne.mockResolvedValue(
          activePolicy({ status: InsurancePolicyStatus.CLAIMED }),
        );

        const result = await service.apply_claim_rules(
          'u1',
          claim(CancellationReason.EVENT_CANCELLED_BY_ORGANIZER),
        );

        expect(result.decision).toBe('reject');
      });

      it('refuses a caller who does not hold the policy', async () => {
        mockPolicyRepo.findOne.mockResolvedValue(
          activePolicy({ userId: 'someone-else' }),
        );

        await expect(
          service.apply_claim_rules(
            'u1',
            claim(CancellationReason.EVENT_CANCELLED_BY_ORGANIZER),
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('auto_adjudicate_claim', () => {
      it('pays a straightforward claim automatically', async () => {
        mockPolicyRepo.findOne.mockResolvedValue(activePolicy());
        mockEventRepo.findOne.mockResolvedValue(cancelledEvent);
        payoutReady();

        const result: any = await service.auto_adjudicate_claim(
          'u1',
          claim(CancellationReason.EVENT_CANCELLED_BY_ORGANIZER),
        );

        expect(result.success).toBe(true);
        expect(result.transactionHash).toBe('tx123');
        expect(mockStellarService.sendPayment).toHaveBeenCalledWith(
          'secret',
          'GHOLDER',
          '100',
          'XLM',
        );
      });

      it('escalates an edge case: persists under_review and pays nothing', async () => {
        const policy = activePolicy();
        mockPolicyRepo.findOne.mockResolvedValue(policy);
        mockEventRepo.findOne.mockResolvedValue(cancelledEvent);

        const result: any = await service.auto_adjudicate_claim(
          'u1',
          claim(CancellationReason.FORCE_MAJEURE),
        );

        expect(result.escalated).toBe(true);
        expect(result.policy.status).toBe(InsurancePolicyStatus.UNDER_REVIEW);
        expect(mockPolicyRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({
            status: InsurancePolicyStatus.UNDER_REVIEW,
            claimReason: CancellationReason.FORCE_MAJEURE,
            escalationReason: expect.stringMatching(/requires human review/),
            escalatedAt: expect.any(Date),
          }),
        );
        expect(mockAuditService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'INSURANCE_CLAIM_ESCALATED',
            userId: 'u1',
          }),
        );
        expect(mockStellarService.sendPayment).not.toHaveBeenCalled();
      });

      it('rejects an invalid claim with the failing rule and escalates nothing', async () => {
        mockPolicyRepo.findOne.mockResolvedValue(activePolicy());
        mockEventRepo.findOne.mockResolvedValue({
          id: 'e1',
          status: EventStatus.PUBLISHED,
        });

        await expect(
          service.auto_adjudicate_claim('u1', claim(CancellationReason.OTHER)),
        ).rejects.toThrow(/only paid for cancelled events/);
        expect(mockPolicyRepo.save).not.toHaveBeenCalled();
      });
    });

    describe('human review', () => {
      it('lists claims under review, oldest first', async () => {
        mockPolicyRepo.find.mockResolvedValue([
          activePolicy({ status: InsurancePolicyStatus.UNDER_REVIEW }),
        ]);

        const queue = await service.listClaimsUnderReview();

        expect(mockPolicyRepo.find).toHaveBeenCalledWith({
          where: { status: InsurancePolicyStatus.UNDER_REVIEW },
          order: { escalatedAt: 'ASC' },
        });
        expect(queue).toHaveLength(1);
      });

      it('approval pays the policy holder and records the reviewer', async () => {
        mockPolicyRepo.findOne.mockResolvedValue(
          activePolicy({
            status: InsurancePolicyStatus.UNDER_REVIEW,
            claimReason: CancellationReason.FORCE_MAJEURE,
          }),
        );
        payoutReady();

        const result: any = await service.reviewEscalatedClaim(
          'pol1',
          'admin1',
          'approve',
          'ok',
        );

        expect(result.success).toBe(true);
        expect(mockStellarService.sendPayment).toHaveBeenCalledWith(
          'secret',
          'GHOLDER',
          '100',
          'XLM',
        );
        expect(mockPolicyRepo.save).toHaveBeenLastCalledWith(
          expect.objectContaining({
            status: InsurancePolicyStatus.CLAIMED,
            reviewedBy: 'admin1',
            reviewNote: 'ok',
          }),
        );
      });

      it('rejection closes the claim without payout', async () => {
        mockPolicyRepo.findOne.mockResolvedValue(
          activePolicy({ status: InsurancePolicyStatus.UNDER_REVIEW }),
        );

        const result: any = await service.reviewEscalatedClaim(
          'pol1',
          'admin1',
          'reject',
          'no proof',
        );

        expect(result.status).toBe(InsurancePolicyStatus.CLAIM_REJECTED);
        expect(mockStellarService.sendPayment).not.toHaveBeenCalled();
        expect(mockAuditService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'INSURANCE_CLAIM_REJECTED',
            userId: 'admin1',
          }),
        );
      });

      it('refuses to decide a claim that is not under review', async () => {
        mockPolicyRepo.findOne.mockResolvedValue(activePolicy());

        await expect(
          service.reviewEscalatedClaim('pol1', 'admin1', 'approve'),
        ).rejects.toThrow(BadRequestException);
        expect(mockStellarService.sendPayment).not.toHaveBeenCalled();
      });
    });
  });
});
