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
});
