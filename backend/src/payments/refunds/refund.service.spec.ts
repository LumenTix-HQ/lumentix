import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { RefundService } from './refund.service';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { TicketEntity } from '../../tickets/entities/ticket.entity';
import { Event, EventStatus } from '../../events/entities/event.entity';
import { User } from '../../users/entities/user.entity';
import { StellarService } from '../../stellar/stellar.service';
import { AuditService } from '../../audit/audit.service';
import { EscrowService } from '../services/escrow.service';
import { NotificationService } from '../../notifications/notification.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockRepo = <T>() => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
});

const CANCELLED_EVENT = {
  id: 'event-1',
  title: 'Test Event',
  status: EventStatus.CANCELLED,
  escrowPublicKey: 'ESCROW_PUB',
  escrowSecretEncrypted: 'iv:tag:cipher',
} as Event;

const CONFIRMED_PAYMENT = {
  id: 'pay-1',
  eventId: 'event-1',
  userId: 'user-1',
  amount: 10,
  currency: 'XLM',
  status: PaymentStatus.CONFIRMED,
} as Payment;

const USER_WITH_KEY = {
  id: 'user-1',
  stellarPublicKey: 'GUSER_PUB_KEY',
} as User;

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('RefundService', () => {
  let service: RefundService;
  let paymentsRepo: jest.Mocked<Repository<Payment>>;
  let ticketsRepo: jest.Mocked<Repository<TicketEntity>>;
  let eventsRepo: jest.Mocked<Repository<Event>>;
  let usersRepo: jest.Mocked<Repository<User>>;
  let stellarService: jest.Mocked<StellarService>;
  let auditService: jest.Mocked<AuditService>;
  let escrowService: jest.Mocked<EscrowService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundService,
        { provide: getRepositoryToken(Payment), useValue: mockRepo() },
        { provide: getRepositoryToken(TicketEntity), useValue: mockRepo() },
        { provide: getRepositoryToken(Event), useValue: mockRepo() },
        { provide: getRepositoryToken(User), useValue: mockRepo() },
        {
          provide: StellarService,
          useValue: { sendPayment: jest.fn() },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: EscrowService,
          useValue: { decryptEscrowSecret: jest.fn() },
        },
        {
          provide: NotificationService,
          useValue: { queueRefundEmail: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(RefundService);
    paymentsRepo = module.get(getRepositoryToken(Payment));
    ticketsRepo = module.get(getRepositoryToken(TicketEntity));
    eventsRepo = module.get(getRepositoryToken(Event));
    usersRepo = module.get(getRepositoryToken(User));
    stellarService = module.get(StellarService);
    auditService = module.get(AuditService);
    escrowService = module.get(EscrowService);
  });

  // ─── Guard: event must be cancelled ────────────────────────────────────────

  describe('refundEvent() — guard checks', () => {
    it('throws NotFoundException when event does not exist', async () => {
      eventsRepo.findOne.mockResolvedValue(null);

      await expect(service.refundEvent('missing-event')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when event is not cancelled', async () => {
      eventsRepo.findOne.mockResolvedValue({
        ...CANCELLED_EVENT,
        status: EventStatus.PUBLISHED,
      } as Event);

      await expect(service.refundEvent('event-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when event has no escrow account', async () => {
      eventsRepo.findOne.mockResolvedValue({
        ...CANCELLED_EVENT,
        escrowPublicKey: null,
        escrowSecretEncrypted: null,
      } as Event);

      await expect(service.refundEvent('event-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns empty array when there are no confirmed payments', async () => {
      eventsRepo.findOne.mockResolvedValue(CANCELLED_EVENT);
      paymentsRepo.find.mockResolvedValue([]);
      escrowService.decryptEscrowSecret.mockResolvedValue('raw-secret');

      const results = await service.refundEvent('event-1');
      expect(results).toEqual([]);
    });
  });

  // ─── Happy path: refund triggered on cancellation ──────────────────────────

  describe('refundEvent() — successful refund', () => {
    beforeEach(() => {
      eventsRepo.findOne.mockResolvedValue(CANCELLED_EVENT);
      paymentsRepo.find.mockResolvedValue([CONFIRMED_PAYMENT]);
      escrowService.decryptEscrowSecret.mockResolvedValue('raw-secret');
      usersRepo.findOne.mockResolvedValue(USER_WITH_KEY);
      stellarService.sendPayment.mockResolvedValue({
        hash: 'tx-hash-abc',
      } as any);
      paymentsRepo.save.mockResolvedValue({
        ...CONFIRMED_PAYMENT,
        status: PaymentStatus.REFUNDED,
      } as Payment);
      ticketsRepo.update.mockResolvedValue({ affected: 1 } as any);
    });

    it('returns a successful result for each payment', async () => {
      const results = await service.refundEvent('event-1');

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].transactionHash).toBe('tx-hash-abc');
      expect(results[0].paymentId).toBe('pay-1');
    });

    it('calls StellarService.sendPayment with correct args', async () => {
      await service.refundEvent('event-1');

      expect(stellarService.sendPayment).toHaveBeenCalledWith(
        'raw-secret',
        USER_WITH_KEY.stellarPublicKey,
        '10',
        'XLM',
      );
    });

    it('marks payment status as REFUNDED', async () => {
      await service.refundEvent('event-1');

      expect(paymentsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.REFUNDED }),
      );
    });

    it('marks ticket status as refunded', async () => {
      await service.refundEvent('event-1');

      expect(ticketsRepo.update).toHaveBeenCalledWith(
        { eventId: 'event-1', ownerId: 'user-1' },
        { status: 'refunded' },
      );
    });

    it('logs REFUND_ISSUED via AuditService', async () => {
      await service.refundEvent('event-1');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REFUND_ISSUED' }),
      );
    });
  });

  // ─── Partial refund rejection ──────────────────────────────────────────────

  describe('refundEvent() — partial refund rejected', () => {
    it('returns failure result when payment amount is 0', async () => {
      eventsRepo.findOne.mockResolvedValue(CANCELLED_EVENT);
      paymentsRepo.find.mockResolvedValue([
        { ...CONFIRMED_PAYMENT, amount: 0 },
      ]);
      escrowService.decryptEscrowSecret.mockResolvedValue('raw-secret');
      usersRepo.findOne.mockResolvedValue(USER_WITH_KEY);

      const results = await service.refundEvent('event-1');

      expect(results[0].success).toBe(false);
      expect(results[0].error).toMatch(/partial or zero/i);
      expect(stellarService.sendPayment).not.toHaveBeenCalled();
    });

    it('returns failure result when payment amount is negative', async () => {
      eventsRepo.findOne.mockResolvedValue(CANCELLED_EVENT);
      paymentsRepo.find.mockResolvedValue([
        { ...CONFIRMED_PAYMENT, amount: -5 },
      ]);
      escrowService.decryptEscrowSecret.mockResolvedValue('raw-secret');
      usersRepo.findOne.mockResolvedValue(USER_WITH_KEY);

      const results = await service.refundEvent('event-1');

      expect(results[0].success).toBe(false);
      expect(stellarService.sendPayment).not.toHaveBeenCalled();
    });
  });

  // ─── User has no Stellar key ───────────────────────────────────────────────

  describe('refundEvent() — user missing Stellar key', () => {
    it('returns failure result and does not call sendPayment', async () => {
      eventsRepo.findOne.mockResolvedValue(CANCELLED_EVENT);
      paymentsRepo.find.mockResolvedValue([CONFIRMED_PAYMENT]);
      escrowService.decryptEscrowSecret.mockResolvedValue('raw-secret');
      usersRepo.findOne.mockResolvedValue({
        ...USER_WITH_KEY,
        stellarPublicKey: null,
      });

      const results = await service.refundEvent('event-1');

      expect(results[0].success).toBe(false);
      expect(results[0].error).toMatch(/no Stellar public key/i);
      expect(stellarService.sendPayment).not.toHaveBeenCalled();
    });
  });

  // ─── Stellar send failure isolation ───────────────────────────────────────

  describe('refundEvent() — Stellar failure isolation', () => {
    it('isolates Stellar errors and continues processing other payments', async () => {
      const payment2 = {
        ...CONFIRMED_PAYMENT,
        id: 'pay-2',
        userId: 'user-2',
      } as Payment;
      const user2 = {
        id: 'user-2',
        stellarPublicKey: 'GUSER2_PUB_KEY',
      } as User;

      eventsRepo.findOne.mockResolvedValue(CANCELLED_EVENT);
      paymentsRepo.find.mockResolvedValue([CONFIRMED_PAYMENT, payment2]);
      escrowService.decryptEscrowSecret.mockResolvedValue('raw-secret');

      usersRepo.findOne
        .mockResolvedValueOnce(USER_WITH_KEY) // pay-1 user found
        .mockResolvedValueOnce(user2); // pay-2 user found

      stellarService.sendPayment
        .mockRejectedValueOnce(new Error('Horizon timeout')) // pay-1 fails
        .mockResolvedValueOnce({ hash: 'tx-success' } as any); // pay-2 succeeds

      paymentsRepo.save.mockResolvedValue(CONFIRMED_PAYMENT);
      ticketsRepo.update.mockResolvedValue({ affected: 1 } as any);

      const results = await service.refundEvent('event-1');

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toMatch(/Horizon timeout/);
      expect(results[1].success).toBe(true);
      expect(results[1].transactionHash).toBe('tx-success');
    });
  });

  // ─── processSingleRefund — via refundSinglePayment ────────────────────────

  describe('processSingleRefund() — via refundSinglePayment()', () => {
    const CONFIRMED_PAYMENT_WITH_EVENT = {
      ...CONFIRMED_PAYMENT,
      eventId: 'event-1',
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1h ago
    } as Payment;

    const EVENT_WITH_ESCROW = {
      ...CANCELLED_EVENT,
      status: EventStatus.PUBLISHED,
      startDate: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h from now
    } as Event;

    it('throws NotFoundException when payment not found', async () => {
      paymentsRepo.findOne.mockResolvedValue(null);

      await expect(service.refundSinglePayment('missing-pay')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when event not found', async () => {
      paymentsRepo.findOne.mockResolvedValue(CONFIRMED_PAYMENT_WITH_EVENT);
      eventsRepo.findOne.mockResolvedValue(null);

      await expect(service.refundSinglePayment('pay-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when event has no escrow', async () => {
      paymentsRepo.findOne.mockResolvedValue(CONFIRMED_PAYMENT_WITH_EVENT);
      eventsRepo.findOne.mockResolvedValue({
        ...EVENT_WITH_ESCROW,
        escrowPublicKey: null,
        escrowSecretEncrypted: null,
      } as Event);

      await expect(service.refundSinglePayment('pay-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns failure result when user has no stellarPublicKey', async () => {
      paymentsRepo.findOne
        .mockResolvedValueOnce(CONFIRMED_PAYMENT_WITH_EVENT) // refundSinglePayment lookup
        .mockResolvedValueOnce(CONFIRMED_PAYMENT_WITH_EVENT); // checkRefundEligibility lookup
      eventsRepo.findOne.mockResolvedValue(EVENT_WITH_ESCROW);
      escrowService.decryptEscrowSecret.mockResolvedValue('raw-secret');
      usersRepo.findOne.mockResolvedValue({ ...USER_WITH_KEY, stellarPublicKey: null });

      const result = await service.refundSinglePayment('pay-1');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no Stellar public key/i);
      expect(stellarService.sendPayment).not.toHaveBeenCalled();
    });

    it('calls StellarService.sendPayment with correct args on success', async () => {
      paymentsRepo.findOne
        .mockResolvedValueOnce(CONFIRMED_PAYMENT_WITH_EVENT)
        .mockResolvedValueOnce(CONFIRMED_PAYMENT_WITH_EVENT);
      eventsRepo.findOne.mockResolvedValue(EVENT_WITH_ESCROW);
      escrowService.decryptEscrowSecret.mockResolvedValue('raw-secret');
      usersRepo.findOne.mockResolvedValue(USER_WITH_KEY);
      stellarService.sendPayment.mockResolvedValue({ hash: 'tx-abc' } as any);
      paymentsRepo.save.mockResolvedValue({
        ...CONFIRMED_PAYMENT_WITH_EVENT,
        status: PaymentStatus.REFUNDED,
      } as Payment);
      ticketsRepo.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.refundSinglePayment('pay-1');

      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe('tx-abc');
      expect(stellarService.sendPayment).toHaveBeenCalledWith(
        'raw-secret',
        USER_WITH_KEY.stellarPublicKey,
        expect.any(String),
        'XLM',
      );
    });

    it('sets payment.status to REFUNDED on success', async () => {
      paymentsRepo.findOne
        .mockResolvedValueOnce(CONFIRMED_PAYMENT_WITH_EVENT)
        .mockResolvedValueOnce(CONFIRMED_PAYMENT_WITH_EVENT);
      eventsRepo.findOne.mockResolvedValue(EVENT_WITH_ESCROW);
      escrowService.decryptEscrowSecret.mockResolvedValue('raw-secret');
      usersRepo.findOne.mockResolvedValue(USER_WITH_KEY);
      stellarService.sendPayment.mockResolvedValue({ hash: 'tx-abc' } as any);
      paymentsRepo.save.mockResolvedValue({
        ...CONFIRMED_PAYMENT_WITH_EVENT,
        status: PaymentStatus.REFUNDED,
      } as Payment);
      ticketsRepo.update.mockResolvedValue({ affected: 1 } as any);

      await service.refundSinglePayment('pay-1');

      expect(paymentsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.REFUNDED }),
      );
    });

    it('sets ticket.status to refunded on success', async () => {
      paymentsRepo.findOne
        .mockResolvedValueOnce(CONFIRMED_PAYMENT_WITH_EVENT)
        .mockResolvedValueOnce(CONFIRMED_PAYMENT_WITH_EVENT);
      eventsRepo.findOne.mockResolvedValue(EVENT_WITH_ESCROW);
      escrowService.decryptEscrowSecret.mockResolvedValue('raw-secret');
      usersRepo.findOne.mockResolvedValue(USER_WITH_KEY);
      stellarService.sendPayment.mockResolvedValue({ hash: 'tx-abc' } as any);
      paymentsRepo.save.mockResolvedValue(CONFIRMED_PAYMENT_WITH_EVENT as Payment);
      ticketsRepo.update.mockResolvedValue({ affected: 1 } as any);

      await service.refundSinglePayment('pay-1');

      expect(ticketsRepo.update).toHaveBeenCalledWith(
        { eventId: 'event-1', ownerId: 'user-1' },
        { status: 'refunded' },
      );
    });

    it('queues refund notification email on success', async () => {
      paymentsRepo.findOne
        .mockResolvedValueOnce(CONFIRMED_PAYMENT_WITH_EVENT)
        .mockResolvedValueOnce(CONFIRMED_PAYMENT_WITH_EVENT);
      eventsRepo.findOne.mockResolvedValue(EVENT_WITH_ESCROW);
      escrowService.decryptEscrowSecret.mockResolvedValue('raw-secret');
      usersRepo.findOne.mockResolvedValue({ ...USER_WITH_KEY, email: 'user@test.com' });
      stellarService.sendPayment.mockResolvedValue({ hash: 'tx-abc' } as any);
      paymentsRepo.save.mockResolvedValue(CONFIRMED_PAYMENT_WITH_EVENT as Payment);
      ticketsRepo.update.mockResolvedValue({ affected: 1 } as any);

      // NotificationService mock is injected — verify queueRefundEmail was called
      const notifMock = (service as any).notificationService;
      await service.refundSinglePayment('pay-1');

      expect(notifMock.queueRefundEmail).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'user@test.com' }),
      );
    });

    it('logs REFUND_ISSUED to audit on success', async () => {
      paymentsRepo.findOne
        .mockResolvedValueOnce(CONFIRMED_PAYMENT_WITH_EVENT)
        .mockResolvedValueOnce(CONFIRMED_PAYMENT_WITH_EVENT);
      eventsRepo.findOne.mockResolvedValue(EVENT_WITH_ESCROW);
      escrowService.decryptEscrowSecret.mockResolvedValue('raw-secret');
      usersRepo.findOne.mockResolvedValue(USER_WITH_KEY);
      stellarService.sendPayment.mockResolvedValue({ hash: 'tx-abc' } as any);
      paymentsRepo.save.mockResolvedValue(CONFIRMED_PAYMENT_WITH_EVENT as Payment);
      ticketsRepo.update.mockResolvedValue({ affected: 1 } as any);

      await service.refundSinglePayment('pay-1');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REFUND_ISSUED' }),
      );
    });
  });

  // ─── checkRefundEligibility — 24h cutoff ──────────────────────────────────

  describe('checkRefundEligibility() — 24h cutoff', () => {
    const RECENT_PAYMENT = {
      id: 'pay-1',
      eventId: 'event-1',
      userId: 'user-1',
      amount: 10,
      currency: 'XLM',
      status: PaymentStatus.CONFIRMED,
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1h ago
    } as Payment;

    it('returns eligible: false when event starts within 24h', async () => {
      paymentsRepo.findOne.mockResolvedValue(RECENT_PAYMENT);
      usersRepo.findOne.mockResolvedValue(USER_WITH_KEY);
      eventsRepo.findOne.mockResolvedValue({
        id: 'event-1',
        startDate: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12h from now
      } as any);

      const result = await service.checkRefundEligibility('pay-1');

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('Too close to event start');
      expect(result.refundAmount).toBe(0);
    });

    it('returns eligible: true when event starts more than 24h away', async () => {
      paymentsRepo.findOne.mockResolvedValue(RECENT_PAYMENT);
      usersRepo.findOne.mockResolvedValue(USER_WITH_KEY);
      eventsRepo.findOne.mockResolvedValue({
        id: 'event-1',
        startDate: new Date(Date.now() + 25 * 60 * 60 * 1000), // 25h from now
      } as any);

      const result = await service.checkRefundEligibility('pay-1');

      expect(result.eligible).toBe(true);
      expect(result.refundAmount).toBeGreaterThan(0);
    });
  });
});
