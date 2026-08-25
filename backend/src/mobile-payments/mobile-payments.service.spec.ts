import { Test, TestingModule } from '@nestjs/testing';
import { MobilePaymentsService } from './mobile-payments.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MobilePayment, MobileWalletType, MobilePaymentStatus } from './entities/mobile-payment.entity';
import { Event, EventStatus } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';

describe('MobilePaymentsService', () => {
  let service: MobilePaymentsService;
  let mockPaymentRepo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let mockEventRepo: { findOne: jest.Mock };
  let mockUserRepo: { findOne: jest.Mock };
  let mockAuditService: { log: jest.Mock };
  let mockNotificationService: { queuePaymentConfirmedEmail: jest.Mock };

  beforeEach(async () => {
    mockPaymentRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((dto) => ({ ...dto, id: 'mp1', status: MobilePaymentStatus.AUTHORIZED })),
      save: jest.fn((p) => Promise.resolve(p)),
    };
    mockEventRepo = { findOne: jest.fn() };
    mockUserRepo = { findOne: jest.fn() };
    mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };
    mockNotificationService = { queuePaymentConfirmedEmail: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobilePaymentsService,
        { provide: getRepositoryToken(MobilePayment), useValue: mockPaymentRepo },
        { provide: getRepositoryToken(Event), useValue: mockEventRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: AuditService, useValue: mockAuditService },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<MobilePaymentsService>(MobilePaymentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processMobilePayment', () => {
    it('should throw NotFoundException when event not found', async () => {
      mockEventRepo.findOne.mockResolvedValue(null);

      await expect(
        service.processMobilePayment('u1', { eventId: 'e1', walletType: MobileWalletType.APPLE_PAY, walletToken: 'tok12345678', amount: 100 } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when event not published', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'e1', status: EventStatus.DRAFT });

      await expect(
        service.processMobilePayment('u1', { eventId: 'e1', walletType: MobileWalletType.APPLE_PAY, walletToken: 'tok12345678', amount: 100 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no escrow configured', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'e1', status: EventStatus.PUBLISHED, escrowPublicKey: null });

      await expect(
        service.processMobilePayment('u1', { eventId: 'e1', walletType: MobileWalletType.APPLE_PAY, walletToken: 'tok12345678', amount: 100 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException for invalid wallet token', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'e1', status: EventStatus.PUBLISHED, escrowPublicKey: 'pub', currency: 'XLM', title: 'Event' });
      mockUserRepo.findOne.mockResolvedValue({ id: 'u1', email: 'test@test.com' });

      await expect(
        service.processMobilePayment('u1', { eventId: 'e1', walletType: MobileWalletType.APPLE_PAY, walletToken: 'short', amount: 100 } as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateWalletCredentials', () => {
    it('should return false for short token', async () => {
      const result = await service.validateWalletCredentials('short', MobileWalletType.APPLE_PAY);
      expect(result).toBe(false);
    });

    it('should return false for unknown wallet type', async () => {
      const result = await service.validateWalletCredentials('longenoughtoken', 'UNKNOWN' as any);
      expect(result).toBe(false);
    });
  });

  describe('handlePaymentCallback', () => {
    it('should throw NotFoundException for unknown gateway reference', async () => {
      mockPaymentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.handlePaymentCallback({ gatewayReference: 'unknown', status: 'completed' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
