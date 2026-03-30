import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EscrowService } from './escrow.service';
import { encrypt } from './encryption.util';
import { AuditService } from 'src/audit/audit.service';
import { AuditAction } from 'src/audit/entities/audit-log.entity';
import { Event, EventStatus } from 'src/events/entities/event.entity';
import { StellarService } from 'src/stellar';

// ─── Constants ───────────────────────────────────────────────────────────────

const ENCRYPTION_SECRET = 'test-encryption-secret-32-chars!!';
const FUNDER_SECRET = 'SFUNDER_SECRET_KEY';
const ESCROW_PUBLIC_KEY = 'GESCROW_PUBLIC_KEY_ABC123';
const ESCROW_SECRET = 'SESCROW_SECRET_KEY_ABC123';
const ORGANIZER_WALLET = 'GORGANIZER_WALLET_XYZ789';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'event-uuid-1',
    title: 'NestFest',
    description: 'Conference',
    location: 'Lagos',
    startDate: new Date('2025-09-01'),
    endDate: new Date('2025-09-02'),
    ticketPrice: 50,
    currency: 'XLM',
    organizerId: 'org-uuid-1',
    status: EventStatus.PUBLISHED,
    maxAttendees: null,
    escrowPublicKey: null,
    escrowSecretEncrypted: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── QueryBuilder mock ────────────────────────────────────────────────────────

function makeQbMock(returnValue: Event | null) {
  const qb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
    addSelect: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(returnValue),
  };
  return qb;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EscrowService', () => {
  let service: EscrowService;
  let stellarService: jest.Mocked<
    Pick<
      StellarService,
      | 'generateEscrowKeypair'
      | 'fundEscrowAccount'
      | 'releaseEscrowFunds'
      | 'getXlmBalance'
    >
  >;
  let auditService: jest.Mocked<Pick<AuditService, 'log'>>;
  let eventRepository: { createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    stellarService = {
      generateEscrowKeypair: jest.fn().mockReturnValue({
        publicKey: ESCROW_PUBLIC_KEY,
        secret: ESCROW_SECRET,
      }),
      fundEscrowAccount: jest.fn().mockResolvedValue({ hash: 'fund-tx-hash' }),
      releaseEscrowFunds: jest
        .fn()
        .mockResolvedValue({ hash: 'release-tx-hash' }),
      getXlmBalance: jest.fn().mockResolvedValue('100.0000000'),
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    eventRepository = { createQueryBuilder: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscrowService,
        { provide: getRepositoryToken(Event), useValue: eventRepository },
        { provide: StellarService, useValue: stellarService },
        { provide: AuditService, useValue: auditService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'ESCROW_ENCRYPTION_SECRET') return ENCRYPTION_SECRET;
              if (key === 'ESCROW_FUNDER_SECRET') return FUNDER_SECRET;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = (module as any).get(EscrowService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── createEscrow ────────────────────────────────────────────────────────

  describe('createEscrow', () => {
    it('creates, funds, and stores an escrow account for a published event', async () => {
      const event = makeEvent({ status: EventStatus.PUBLISHED });
      const qb = makeQbMock(event);
      eventRepository.createQueryBuilder.mockReturnValue(qb);

      const publicKey = await service.createEscrow('event-uuid-1');

      expect(stellarService.generateEscrowKeypair).toHaveBeenCalled();
      expect(stellarService.fundEscrowAccount).toHaveBeenCalledWith(
        FUNDER_SECRET,
        ESCROW_PUBLIC_KEY,
      );
      expect(qb.set).toHaveBeenCalledWith(
        expect.objectContaining({ escrowPublicKey: ESCROW_PUBLIC_KEY }),
      );
      expect(publicKey).toBe(ESCROW_PUBLIC_KEY);
    });

    it('does not store the plain-text secret', async () => {
      const event = makeEvent({ status: EventStatus.PUBLISHED });
      const qb = makeQbMock(event);
      eventRepository.createQueryBuilder.mockReturnValue(qb);

      await service.createEscrow('event-uuid-1');

      const setCall = qb.set.mock.calls[0][0] as Record<string, unknown>;
      expect(setCall.escrowSecretEncrypted).not.toBe(ESCROW_SECRET);
      // Encrypted value should contain colons (iv:tag:ciphertext format)
      expect(typeof setCall.escrowSecretEncrypted).toBe('string');
      expect((setCall.escrowSecretEncrypted as string).split(':').length).toBe(
        3,
      );
    });

    it('returns existing escrow public key if escrow already exists', async () => {
      const event = makeEvent({
        status: EventStatus.PUBLISHED,
        escrowPublicKey: ESCROW_PUBLIC_KEY,
      });
      const qb = makeQbMock(event);
      eventRepository.createQueryBuilder.mockReturnValue(qb);

      const publicKey = await service.createEscrow('event-uuid-1');

      expect(stellarService.fundEscrowAccount).not.toHaveBeenCalled();
      expect(publicKey).toBe(ESCROW_PUBLIC_KEY);
    });

    it('throws BadRequestException for a non-published event', async () => {
      const event = makeEvent({ status: EventStatus.DRAFT });
      const qb = makeQbMock(event);
      eventRepository.createQueryBuilder.mockReturnValue(qb);

      await expect(service.createEscrow('event-uuid-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws InternalServerErrorException if funding fails', async () => {
      const event = makeEvent({ status: EventStatus.PUBLISHED });
      const qb = makeQbMock(event);
      eventRepository.createQueryBuilder.mockReturnValue(qb);
      stellarService.fundEscrowAccount.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(service.createEscrow('event-uuid-1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('logs an audit entry with ESCROW_CREATED action on success', async () => {
      const event = makeEvent({ status: EventStatus.PUBLISHED });
      const qb = makeQbMock(event);
      eventRepository.createQueryBuilder.mockReturnValue(qb);

      await service.createEscrow('event-uuid-1');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.ESCROW_CREATED,
          resourceId: 'event-uuid-1',
        }),
      );
    });
  });

  // ── releaseEscrow ───────────────────────────────────────────────────────

  describe('releaseEscrow', () => {
    function makeCompletedEvent() {
      const encrypted = encrypt(ESCROW_SECRET, ENCRYPTION_SECRET);
      return makeEvent({
        status: EventStatus.COMPLETED,
        escrowPublicKey: ESCROW_PUBLIC_KEY,
        escrowSecretEncrypted: encrypted,
      });
    }

    it('releases funds to the organizer wallet for a completed event', async () => {
      const event = makeCompletedEvent();
      const qb = makeQbMock(event);
      eventRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.releaseEscrow(
        'event-uuid-1',
        ORGANIZER_WALLET,
      );

      expect(stellarService.releaseEscrowFunds).toHaveBeenCalledWith(
        ESCROW_SECRET,
        ORGANIZER_WALLET,
      );
      expect(result.txHash).toBe('release-tx-hash');
      expect(result.amount).toBe('100.0000000');
    });

    it('clears the encrypted secret from DB after release', async () => {
      const event = makeCompletedEvent();
      const qb = makeQbMock(event);
      eventRepository.createQueryBuilder.mockReturnValue(qb);

      await service.releaseEscrow('event-uuid-1', ORGANIZER_WALLET);

      expect(qb.set).toHaveBeenCalledWith({ escrowSecretEncrypted: null });
    });

    it('throws BadRequestException if event is not completed', async () => {
      const event = makeEvent({ status: EventStatus.PUBLISHED });
      const qb = makeQbMock(event);
      eventRepository.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.releaseEscrow('event-uuid-1', ORGANIZER_WALLET),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if no escrow account exists', async () => {
      const event = makeEvent({
        status: EventStatus.COMPLETED,
        escrowPublicKey: null,
      });
      const qb = makeQbMock(event);
      eventRepository.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.releaseEscrow('event-uuid-1', ORGANIZER_WALLET),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws InternalServerErrorException if Stellar transfer fails', async () => {
      const event = makeCompletedEvent();
      const qb = makeQbMock(event);
      eventRepository.createQueryBuilder.mockReturnValue(qb);
      stellarService.releaseEscrowFunds.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(
        service.releaseEscrow('event-uuid-1', ORGANIZER_WALLET),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('logs an audit entry on successful release', async () => {
      const event = makeCompletedEvent();
      const qb = makeQbMock(event);
      eventRepository.createQueryBuilder.mockReturnValue(qb);

      await service.releaseEscrow('event-uuid-1', ORGANIZER_WALLET);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            txHash: 'release-tx-hash',
            organizerWallet: ORGANIZER_WALLET,
          }),
        }),
      );
    });
  });

  // ── handleCancellation ──────────────────────────────────────────────────

  describe('handleCancellation', () => {
    it('returns escrow info for a cancelled event', async () => {
      const event = makeEvent({
        status: EventStatus.CANCELLED,
        escrowPublicKey: ESCROW_PUBLIC_KEY,
      });
      const qb = makeQbMock(event);
      eventRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.handleCancellation('event-uuid-1');

      expect(result.escrowPublicKey).toBe(ESCROW_PUBLIC_KEY);
      expect(result.balance).toBe('100.0000000');
    });

    it('throws BadRequestException if event is not cancelled', async () => {
      const event = makeEvent({ status: EventStatus.PUBLISHED });
      const qb = makeQbMock(event);
      eventRepository.createQueryBuilder.mockReturnValue(qb);

      await expect(service.handleCancellation('event-uuid-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if no escrow account exists', async () => {
      const event = makeEvent({
        status: EventStatus.CANCELLED,
        escrowPublicKey: null,
      });
      const qb = makeQbMock(event);
      eventRepository.createQueryBuilder.mockReturnValue(qb);

      await expect(service.handleCancellation('event-uuid-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
