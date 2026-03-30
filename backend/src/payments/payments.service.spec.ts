import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { EventsService } from '../events/events.service';
import { StellarService } from '../stellar/stellar.service';
import { AuditService } from '../audit/audit.service';
import { ConfigService } from '@nestjs/config';
import { EventStatus } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { NotificationService } from '../notifications/notification.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let mockPaymentsRepo: Record<string, jest.Mock>;
  let mockEventsService: Record<string, jest.Mock>;
  let mockStellarService: Record<string, jest.Mock>;
  let mockAuditService: Record<string, jest.Mock>;
  let mockConfigService: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockPaymentsRepo = {
      findOne: jest.fn(),
      count: jest.fn(),
      create: jest.fn((x: Partial<Payment>) => ({
        ...x,
      })),
      save: jest.fn(
        (x: Partial<Payment>) =>
          ({
            id: 'pay-123',
            createdAt: new Date(),
            updatedAt: new Date(),
            ...x,
          }) as Payment,
      ),
    };

    mockEventsService = {
      getEventById: jest.fn(),
    };

    mockStellarService = {
      getTransaction: jest.fn(),
      extractAndValidateMemo: jest.fn(),
    };

    mockAuditService = {
      log: jest.fn(() => undefined),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'PAYMENT_INTENT_TTL_MINUTES') return 30;
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(Payment), useValue: mockPaymentsRepo },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        { provide: EventsService, useValue: mockEventsService },
        { provide: StellarService, useValue: mockStellarService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: NotificationService,
          useValue: { queuePaymentFailedEmail: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  describe('createPaymentIntent', () => {
    it('should throw NotFoundException when event not found', async () => {
      mockEventsService.getEventById.mockRejectedValue(
        new NotFoundException('Event not found'),
      );

      await expect(
        service.createPaymentIntent('event-123', 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when event is CANCELLED', async () => {
      mockEventsService.getEventById.mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        status: EventStatus.CANCELLED,
        escrowPublicKey: 'EVENT_ESCROW_WALLET',
        currency: 'USDC',
        ticketPrice: 100,
        maxAttendees: null,
      });

      await expect(
        service.createPaymentIntent('event-123', 'user-123'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createPaymentIntent('event-123', 'user-123'),
      ).rejects.toThrow('suspended');
    });

    it('should throw BadRequestException when event is not PUBLISHED', async () => {
      mockEventsService.getEventById.mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        status: EventStatus.DRAFT,
        escrowPublicKey: 'EVENT_ESCROW_WALLET',
        currency: 'USDC',
        ticketPrice: 100,
        maxAttendees: null,
      });

      await expect(
        service.createPaymentIntent('event-123', 'user-123'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createPaymentIntent('event-123', 'user-123'),
      ).rejects.toThrow('not available for purchase');
    });

    it('should throw BadRequestException for unsupported asset', async () => {
      mockEventsService.getEventById.mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        status: EventStatus.PUBLISHED,
        escrowPublicKey: 'EVENT_ESCROW_WALLET',
        currency: 'BTC',
        ticketPrice: 100,
        maxAttendees: null,
      });

      await expect(
        service.createPaymentIntent('event-123', 'user-123'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createPaymentIntent('event-123', 'user-123'),
      ).rejects.toThrow('Unsupported asset');
    });

    it('should throw BadRequestException when event capacity is reached', async () => {
      mockEventsService.getEventById.mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        status: EventStatus.PUBLISHED,
        escrowPublicKey: 'EVENT_ESCROW_WALLET',
        currency: 'USDC',
        ticketPrice: 100,
        maxAttendees: 10,
      });

      mockPaymentsRepo.count.mockResolvedValue(10);

      await expect(
        service.createPaymentIntent('event-123', 'user-123'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createPaymentIntent('event-123', 'user-123'),
      ).rejects.toThrow('maximum capacity');
    });

    it('should return existing non-expired PENDING payment', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 10 * 60_000); // 10 minutes in future

      mockEventsService.getEventById.mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        status: EventStatus.PUBLISHED,
        escrowPublicKey: 'EVENT_ESCROW_WALLET',
        currency: 'USDC',
        ticketPrice: 100,
        maxAttendees: null,
      });

      mockPaymentsRepo.count.mockResolvedValue(0);
      mockPaymentsRepo.findOne.mockResolvedValue({
        id: 'pay-123',
        status: PaymentStatus.PENDING,
        expiresAt: futureDate,
        eventId: 'event-123',
        userId: 'user-123',
        amount: 100,
        currency: 'USDC',
      });

      const result = await service.createPaymentIntent('event-123', 'user-123');

      expect(result.paymentId).toBe('pay-123');
      expect(result.memo).toBe('pay-123');
      expect(result.amount).toBe(100);
      expect(result.currency).toBe('USDC');
      expect(result.escrowWallet).toBe('EVENT_ESCROW_WALLET');
    });

    it('should mark expired PENDING payment as FAILED and create new one', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 10 * 60_000); // 10 minutes in past

      mockEventsService.getEventById.mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        status: EventStatus.PUBLISHED,
        escrowPublicKey: 'EVENT_ESCROW_WALLET',
        currency: 'USDC',
        ticketPrice: 100,
        maxAttendees: null,
      });

      mockPaymentsRepo.count.mockResolvedValue(0);
      mockPaymentsRepo.findOne.mockResolvedValue({
        id: 'pay-old',
        status: PaymentStatus.PENDING,
        expiresAt: pastDate,
        eventId: 'event-123',
        userId: 'user-123',
        amount: 100,
        currency: 'USDC',
      });

      mockPaymentsRepo.save.mockResolvedValue({
        id: 'pay-new',
        eventId: 'event-123',
        userId: 'user-123',
        amount: 100,
        currency: 'USDC',
        status: PaymentStatus.PENDING,
        expiresAt: new Date(now.getTime() + 30 * 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
        transactionHash: null,
      } as Payment);

      const result = await service.createPaymentIntent('event-123', 'user-123');

      expect(mockPaymentsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PaymentStatus.FAILED,
        }),
      );
      expect(result.paymentId).toBe('pay-new');
    });

    it('should successfully create new payment intent', async () => {
      const now = new Date();

      mockEventsService.getEventById.mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        status: EventStatus.PUBLISHED,
        escrowPublicKey: 'EVENT_ESCROW_WALLET',
        currency: 'USDC',
        ticketPrice: 100,
        maxAttendees: null,
      });

      mockPaymentsRepo.count.mockResolvedValue(0);
      mockPaymentsRepo.findOne.mockResolvedValue(null);

      mockPaymentsRepo.create.mockReturnValue({
        eventId: 'event-123',
        userId: 'user-123',
        amount: 100,
        currency: 'USDC',
        status: PaymentStatus.PENDING,
      });

      mockPaymentsRepo.save.mockResolvedValue({
        id: 'pay-new-123',
        eventId: 'event-123',
        userId: 'user-123',
        amount: 100,
        currency: 'USDC',
        status: PaymentStatus.PENDING,
        expiresAt: new Date(now.getTime() + 30 * 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
        transactionHash: null,
      } as Payment);

      const result = await service.createPaymentIntent('event-123', 'user-123');

      expect(result.paymentId).toBe('pay-new-123');
      expect(result.escrowWallet).toBe('EVENT_ESCROW_WALLET');
      expect(result.amount).toBe(100);
      expect(result.currency).toBe('USDC');
      expect(result.memo).toBe('pay-new-123');
      expect(result.expiresAt).toBeDefined();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYMENT_INTENT_CREATED',
          userId: 'user-123',
        }),
      );
    });

    it('should throw ConflictException when published event has no escrow wallet', async () => {
      mockEventsService.getEventById.mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        status: EventStatus.PUBLISHED,
        escrowPublicKey: null,
        currency: 'USDC',
        ticketPrice: 100,
        maxAttendees: null,
      });

      await expect(
        service.createPaymentIntent('event-123', 'user-123'),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.createPaymentIntent('event-123', 'user-123'),
      ).rejects.toThrow('does not have an escrow wallet configured');
    });
  });

  describe('confirmPayment', () => {
    it('should throw BadRequestException when transaction not found', async () => {
      mockStellarService.getTransaction.mockRejectedValue(
        new Error('Not found'),
      );

      await expect(
        service.confirmPayment('invalid-hash', 'user-123'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.confirmPayment('invalid-hash', 'user-123'),
      ).rejects.toThrow('not found on the Stellar network');
    });

    it('should throw BadRequestException when transaction missing memo', async () => {
      mockStellarService.getTransaction.mockResolvedValue({
        id: 'tx-123',
        memo: null,
        _links: { operations: { href: 'http://example.com' } },
      });
      mockStellarService.extractAndValidateMemo.mockImplementation(() => {
        throw new BadRequestException(
          'Transaction is missing a memo. Cannot correlate with a payment or contribution intent.',
        );
      });

      await expect(
        service.confirmPayment('tx-hash', 'user-123'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.confirmPayment('tx-hash', 'user-123'),
      ).rejects.toThrow('payment or contribution intent');
    });

    it('should throw NotFoundException when no pending payment for memo', async () => {
      mockStellarService.getTransaction.mockResolvedValue({
        id: 'tx-123',
        memo: 'pay-unknown',
        _links: { operations: { href: 'http://example.com' } },
      });
      mockStellarService.extractAndValidateMemo.mockReturnValue('pay-unknown');

      mockPaymentsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.confirmPayment('tx-hash', 'user-123'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.confirmPayment('tx-hash', 'user-123'),
      ).rejects.toThrow('No pending payment');
    });

    it('should throw BadRequestException when payment expired', async () => {
      const pastDate = new Date(Date.now() - 10 * 60_000);

      mockStellarService.getTransaction.mockResolvedValue({
        id: 'tx-123',
        memo: 'pay-123',
        _links: { operations: { href: 'http://example.com' } },
      });
      mockStellarService.extractAndValidateMemo.mockReturnValue('pay-123');

      mockPaymentsRepo.findOne.mockResolvedValue({
        id: 'pay-123',
        status: PaymentStatus.PENDING,
        expiresAt: pastDate,
        userId: 'user-123',
        eventId: 'event-123',
        amount: 100,
        currency: 'USDC',
      });

      await expect(
        service.confirmPayment('tx-hash', 'user-123'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.confirmPayment('tx-hash', 'user-123'),
      ).rejects.toThrow('expired');
      expect(mockPaymentsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PaymentStatus.FAILED,
        }),
      );
    });

    it('should throw ForbiddenException when caller is not payment owner', async () => {
      const futureDate = new Date(Date.now() + 10 * 60_000);

      mockStellarService.getTransaction.mockResolvedValue({
        id: 'tx-123',
        memo: 'pay-123',
        _links: { operations: { href: 'http://example.com' } },
      });
      mockStellarService.extractAndValidateMemo.mockReturnValue('pay-123');

      mockPaymentsRepo.findOne.mockResolvedValue({
        id: 'pay-123',
        status: PaymentStatus.PENDING,
        expiresAt: futureDate,
        userId: 'user-original',
        eventId: 'event-123',
        amount: 100,
        currency: 'USDC',
      });

      await expect(
        service.confirmPayment('tx-hash', 'user-different'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.confirmPayment('tx-hash', 'user-different'),
      ).rejects.toThrow('not authorised');
    });

    it('should throw BadRequestException when transaction has no operations', async () => {
      const futureDate = new Date(Date.now() + 10 * 60_000);

      mockStellarService.getTransaction.mockResolvedValue({
        id: 'tx-123',
        memo: 'pay-123',
        _links: { operations: { href: 'http://example.com' } },
      });
      mockStellarService.extractAndValidateMemo.mockReturnValue('pay-123');

      mockPaymentsRepo.findOne.mockResolvedValue({
        id: 'pay-123',
        status: PaymentStatus.PENDING,
        expiresAt: futureDate,
        userId: 'user-123',
        eventId: 'event-123',
        amount: 100,
        currency: 'USDC',
      });
      mockEventsService.getEventById.mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        status: EventStatus.PUBLISHED,
        escrowPublicKey: 'EVENT_ESCROW_WALLET',
      });

      // Mock fetch to return no operations
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn(() => ({ _embedded: { records: [] } })),
      });

      await expect(
        service.confirmPayment('tx-hash', 'user-123'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.confirmPayment('tx-hash', 'user-123'),
      ).rejects.toThrow('no payment operations');
    });

    it('should throw BadRequestException when operation sent to wrong destination', async () => {
      const futureDate = new Date(Date.now() + 10 * 60_000);

      mockStellarService.getTransaction.mockResolvedValue({
        id: 'tx-123',
        memo: 'pay-123',
        _links: { operations: { href: 'http://example.com' } },
      });
      mockStellarService.extractAndValidateMemo.mockReturnValue('pay-123');

      mockPaymentsRepo.findOne.mockResolvedValue({
        id: 'pay-123',
        status: PaymentStatus.PENDING,
        expiresAt: futureDate,
        userId: 'user-123',
        eventId: 'event-123',
        amount: 100,
        currency: 'USDC',
      });
      mockEventsService.getEventById.mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        status: EventStatus.PUBLISHED,
        escrowPublicKey: 'EVENT_ESCROW_WALLET',
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn(() => ({
          _embedded: {
            records: [
              {
                type: 'payment',
                to: 'WRONG_WALLET_ADDRESS',
                amount: '100',
                asset_type: 'credit_alphanum4',
                asset_code: 'USDC',
              },
            ],
          },
        })),
      });

      await expect(
        service.confirmPayment('tx-hash', 'user-123'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.confirmPayment('tx-hash', 'user-123'),
      ).rejects.toThrow('does not match the escrow wallet');
    });

    it('should throw BadRequestException when asset type mismatch', async () => {
      const futureDate = new Date(Date.now() + 10 * 60_000);

      mockStellarService.getTransaction.mockResolvedValue({
        id: 'tx-123',
        memo: 'pay-123',
        _links: { operations: { href: 'http://example.com' } },
      });
      mockStellarService.extractAndValidateMemo.mockReturnValue('pay-123');

      mockPaymentsRepo.findOne.mockResolvedValue({
        id: 'pay-123',
        status: PaymentStatus.PENDING,
        expiresAt: futureDate,
        userId: 'user-123',
        eventId: 'event-123',
        amount: 100,
        currency: 'USDC',
      });
      mockEventsService.getEventById.mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        status: EventStatus.PUBLISHED,
        escrowPublicKey: 'EVENT_ESCROW_WALLET',
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn(() => ({
          _embedded: {
            records: [
              {
                type: 'payment',
                to: 'EVENT_ESCROW_WALLET',
                amount: '100',
                asset_type: 'native',
                asset_code: undefined,
              },
            ],
          },
        })),
      });

      await expect(
        service.confirmPayment('tx-hash', 'user-123'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.confirmPayment('tx-hash', 'user-123'),
      ).rejects.toThrow('Incorrect asset type');
    });

    it('should throw BadRequestException when amount mismatch', async () => {
      const futureDate = new Date(Date.now() + 10 * 60_000);

      mockStellarService.getTransaction.mockResolvedValue({
        id: 'tx-123',
        memo: 'pay-123',
        _links: { operations: { href: 'http://example.com' } },
      });
      mockStellarService.extractAndValidateMemo.mockReturnValue('pay-123');

      mockPaymentsRepo.findOne.mockResolvedValue({
        id: 'pay-123',
        status: PaymentStatus.PENDING,
        expiresAt: futureDate,
        userId: 'user-123',
        eventId: 'event-123',
        amount: 100,
        currency: 'USDC',
      });
      mockEventsService.getEventById.mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        status: EventStatus.PUBLISHED,
        escrowPublicKey: 'EVENT_ESCROW_WALLET',
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn(() => ({
          _embedded: {
            records: [
              {
                type: 'payment',
                to: 'EVENT_ESCROW_WALLET',
                amount: '50.5', // Wrong amount
                asset_type: 'credit_alphanum4',
                asset_code: 'USDC',
              },
            ],
          },
        })),
      });

      await expect(
        service.confirmPayment('tx-hash', 'user-123'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.confirmPayment('tx-hash', 'user-123'),
      ).rejects.toThrow('Incorrect payment amount');
    });

    it('should successfully confirm payment', async () => {
      const futureDate = new Date(Date.now() + 10 * 60_000);

      mockStellarService.getTransaction.mockResolvedValue({
        id: 'tx-123',
        memo: 'pay-123',
        _links: { operations: { href: 'http://example.com' } },
      });

      mockPaymentsRepo.findOne.mockResolvedValue({
        id: 'pay-123',
        status: PaymentStatus.PENDING,
        expiresAt: futureDate,
        userId: 'user-123',
        eventId: 'event-123',
        amount: 100,
        currency: 'USDC',
        transactionHash: null,
      });
      mockEventsService.getEventById.mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        status: EventStatus.PUBLISHED,
        escrowPublicKey: 'EVENT_ESCROW_WALLET',
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn(() => ({
          _embedded: {
            records: [
              {
                type: 'payment',
                to: 'EVENT_ESCROW_WALLET',
                amount: '100',
                asset_type: 'credit_alphanum4',
                asset_code: 'USDC',
              },
            ],
          },
        })),
      });

      mockPaymentsRepo.save.mockResolvedValue({
        id: 'pay-123',
        status: PaymentStatus.CONFIRMED,
        expiresAt: futureDate,
        userId: 'user-123',
        eventId: 'event-123',
        amount: 100,
        currency: 'USDC',
        transactionHash: 'tx-hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Payment);

      const result = await service.confirmPayment('tx-hash', 'user-123');

      expect(result.status).toBe(PaymentStatus.CONFIRMED);
      expect(result.transactionHash).toBe('tx-hash');
      expect(mockPaymentsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PaymentStatus.CONFIRMED,
          transactionHash: 'tx-hash',
        }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYMENT_CONFIRMED',
          userId: 'user-123',
        }),
      );
    });
  });
});
