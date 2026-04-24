/**
 * Event Lifecycle Integration Tests
 *
 * Covers the full lifecycle of an event from creation through escrow release:
 *   DRAFT → PUBLISHED (escrow created) → COMPLETED (escrow released)
 * and the cancellation path:
 *   PUBLISHED → CANCELLED (refunds triggered)
 *
 * All external I/O (DB, Stellar network, notifications) is mocked so these
 * tests run fast and deterministically.
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { EventsService } from './events.service';
import { Event, EventStatus } from './entities/event.entity';
import { EventStateService } from './state/event-state.service';
import { EscrowService } from '../payments/services/escrow.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { User } from '../users/entities/user.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Payment } from '../payments/entities/payment.entity';
import { SponsorContribution } from '../sponsors/entities/sponsor-contribution.entity';
import { RefundService } from '../payments/refunds/refund.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const ORGANIZER_ID = 'organizer-uuid-1';
const EVENT_ID = 'event-uuid-1';
const ESCROW_PUBLIC_KEY = 'GESCROW_PUBLIC_KEY_LIFECYCLE';
const ORGANIZER_WALLET = 'GORGANIZER_WALLET_LIFECYCLE';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeDraftEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: EVENT_ID,
    title: 'Lifecycle Test Event',
    description: 'Full lifecycle test',
    location: 'Lagos',
    startDate: new Date('2025-12-01T09:00:00Z'),
    endDate: new Date('2025-12-01T18:00:00Z'),
    ticketPrice: 50,
    currency: 'XLM',
    organizerId: ORGANIZER_ID,
    status: EventStatus.DRAFT,
    maxAttendees: 100,
    escrowPublicKey: null,
    escrowSecretEncrypted: null,
    imageUrl: null,
    category: 'conference' as any,
    fundingGoal: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Event Lifecycle — creation to escrow release', () => {
  let eventsService: EventsService;

  // Mocked repositories
  let eventRepo: Record<string, jest.Mock>;
  let ticketRepo: Record<string, jest.Mock>;

  // Mocked services
  let escrowService: { createEscrow: jest.Mock; releaseEscrow: jest.Mock };
  let auditService: { log: jest.Mock };
  let notificationService: {
    queueEventPublishedEmail: jest.Mock;
    queueEventCompletedEmail: jest.Mock;
    queueEventCancelledEmail: jest.Mock;
  };
  let refundService: { refundEvent: jest.Mock };

  beforeEach(async () => {
    // Repository mocks — each test can override individual methods
    eventRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    ticketRepo = {
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
    };

    escrowService = {
      createEscrow: jest.fn().mockResolvedValue(ESCROW_PUBLIC_KEY),
      releaseEscrow: jest
        .fn()
        .mockResolvedValue({
          txHash: 'release-tx-hash',
          amount: '500.0000000',
        }),
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    notificationService = {
      queueEventPublishedEmail: jest.fn().mockResolvedValue(undefined),
      queueEventCompletedEmail: jest.fn().mockResolvedValue(undefined),
      queueEventCancelledEmail: jest.fn().mockResolvedValue(undefined),
    };

    refundService = {
      refundEvent: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        // Real state service — validates transitions without mocking
        EventStateService,
        { provide: getRepositoryToken(Event), useValue: eventRepo },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            findByIds: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: getRepositoryToken(TicketEntity), useValue: ticketRepo },
        {
          provide: getRepositoryToken(Payment),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(SponsorContribution),
          useValue: { createQueryBuilder: jest.fn() },
        },
        { provide: EscrowService, useValue: escrowService },
        { provide: AuditService, useValue: auditService },
        { provide: NotificationService, useValue: notificationService },
        { provide: RefundService, useValue: refundService },
      ],
    }).compile();

    eventsService = module.get<EventsService>(EventsService);
    jest.clearAllMocks();
  });

  // ── Test 1: Event creation produces a DRAFT ──────────────────────────────

  it('1. createEvent — saves a new event in DRAFT status', async () => {
    const dto = {
      title: 'Lifecycle Test Event',
      startDate: '2025-12-01T09:00:00Z',
      endDate: '2025-12-01T18:00:00Z',
      ticketPrice: 50,
      currency: 'XLM',
    };
    const draftEvent = makeDraftEvent();

    eventRepo.create.mockReturnValue(draftEvent);
    eventRepo.save.mockResolvedValue(draftEvent);

    const result = await eventsService.createEvent(dto, ORGANIZER_ID);

    expect(eventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizerId: ORGANIZER_ID }),
    );
    expect(eventRepo.save).toHaveBeenCalledWith(draftEvent);
    expect(result.status).toBe(EventStatus.DRAFT);
    expect(result.escrowPublicKey).toBeNull();
  });

  // ── Test 2: Publishing transitions DRAFT → PUBLISHED and creates escrow ──

  it('2. publishEvent — transitions DRAFT → PUBLISHED and provisions escrow', async () => {
    const draftEvent = makeDraftEvent();
    const publishedEvent = makeDraftEvent({
      status: EventStatus.PUBLISHED,
      escrowPublicKey: ESCROW_PUBLIC_KEY,
    });

    // findOne called twice: once in publishEvent, once in final getEventById
    eventRepo.findOne
      .mockResolvedValueOnce(draftEvent)
      .mockResolvedValueOnce(publishedEvent);
    eventRepo.save.mockResolvedValue({
      ...draftEvent,
      status: EventStatus.PUBLISHED,
    });
    ticketRepo.count.mockResolvedValue(0);

    const result = await eventsService.publishEvent(EVENT_ID, ORGANIZER_ID);

    expect(escrowService.createEscrow).toHaveBeenCalledWith(EVENT_ID);
    expect(result.status).toBe(EventStatus.PUBLISHED);
    expect(result.escrowPublicKey).toBe(ESCROW_PUBLIC_KEY);
  });

  // ── Test 3: Escrow is NOT re-created if already present on publish ────────

  it('3. publishEvent — skips escrow creation when escrow already exists', async () => {
    const alreadyPublished = makeDraftEvent({
      status: EventStatus.DRAFT,
      escrowPublicKey: ESCROW_PUBLIC_KEY,
      escrowSecretEncrypted: 'iv:tag:cipher',
    });
    const publishedEvent = makeDraftEvent({
      status: EventStatus.PUBLISHED,
      escrowPublicKey: ESCROW_PUBLIC_KEY,
      escrowSecretEncrypted: 'iv:tag:cipher',
    });

    eventRepo.findOne
      .mockResolvedValueOnce(alreadyPublished)
      .mockResolvedValueOnce(publishedEvent);
    eventRepo.save.mockResolvedValue({
      ...alreadyPublished,
      status: EventStatus.PUBLISHED,
    });
    ticketRepo.count.mockResolvedValue(0);

    await eventsService.publishEvent(EVENT_ID, ORGANIZER_ID);

    expect(escrowService.createEscrow).not.toHaveBeenCalled();
  });

  // ── Test 4: Completing an event transitions PUBLISHED → COMPLETED ─────────

  it('4. completeEvent — transitions PUBLISHED → COMPLETED and logs audit', async () => {
    const publishedEvent = makeDraftEvent({
      status: EventStatus.PUBLISHED,
      escrowPublicKey: ESCROW_PUBLIC_KEY,
      // endDate in the past so the "has not ended yet" guard passes
      endDate: new Date('2020-01-01T18:00:00Z'),
    });
    const completedEvent = makeDraftEvent({
      status: EventStatus.COMPLETED,
      escrowPublicKey: ESCROW_PUBLIC_KEY,
      endDate: new Date('2020-01-01T18:00:00Z'),
    });

    eventRepo.findOne
      .mockResolvedValueOnce(publishedEvent) // getEventById inside completeEvent
      .mockResolvedValueOnce(completedEvent); // not called again, but safe to have
    eventRepo.save.mockResolvedValue(completedEvent);
    ticketRepo.count.mockResolvedValue(10);

    const result = await eventsService.completeEvent(EVENT_ID, ORGANIZER_ID);

    expect(result.status).toBe(EventStatus.COMPLETED);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.EVENT_COMPLETED,
        userId: ORGANIZER_ID,
        resourceId: EVENT_ID,
      }),
    );
  });

  // ── Test 5: completeEvent rejects if event has not ended yet ─────────────

  it('5. completeEvent — throws BadRequestException when event has not ended', async () => {
    const futureEvent = makeDraftEvent({
      status: EventStatus.PUBLISHED,
      escrowPublicKey: ESCROW_PUBLIC_KEY,
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    });

    eventRepo.findOne.mockResolvedValue(futureEvent);
    ticketRepo.count.mockResolvedValue(0);

    await expect(
      eventsService.completeEvent(EVENT_ID, ORGANIZER_ID),
    ).rejects.toThrow(BadRequestException);

    await expect(
      eventsService.completeEvent(EVENT_ID, ORGANIZER_ID),
    ).rejects.toThrow('has not ended yet');
  });

  // ── Test 6: Cancelling a published event triggers refunds ─────────────────

  it('6. cancelEvent — transitions PUBLISHED → CANCELLED and triggers refund flow', async () => {
    const publishedEvent = makeDraftEvent({
      status: EventStatus.PUBLISHED,
      escrowPublicKey: ESCROW_PUBLIC_KEY,
    });
    const cancelledEvent = makeDraftEvent({
      status: EventStatus.CANCELLED,
      escrowPublicKey: ESCROW_PUBLIC_KEY,
    });

    eventRepo.findOne.mockResolvedValue(publishedEvent);
    eventRepo.save.mockResolvedValue(cancelledEvent);
    ticketRepo.count.mockResolvedValue(0);

    const result = await eventsService.cancelEvent(EVENT_ID, ORGANIZER_ID);

    expect(result.status).toBe(EventStatus.CANCELLED);
    // refundEvent is called non-blocking; give the microtask queue a tick
    await Promise.resolve();
    expect(refundService.refundEvent).toHaveBeenCalledWith(EVENT_ID);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.EVENT_CANCELLED,
        resourceId: EVENT_ID,
      }),
    );
  });

  // ── Test 7: Non-organizer cannot publish an event ─────────────────────────

  it('7. publishEvent — throws ForbiddenException for non-organizer caller', async () => {
    const draftEvent = makeDraftEvent({ organizerId: 'real-organizer-id' });

    eventRepo.findOne.mockResolvedValue(draftEvent);
    ticketRepo.count.mockResolvedValue(0);

    await expect(
      eventsService.publishEvent(EVENT_ID, 'intruder-id'),
    ).rejects.toThrow(ForbiddenException);

    expect(escrowService.createEscrow).not.toHaveBeenCalled();
  });

  // ── Test 8: Invalid state transition is rejected ──────────────────────────

  it('8. completeEvent — throws BadRequestException for invalid DRAFT → COMPLETED transition', async () => {
    // A DRAFT event cannot jump directly to COMPLETED
    const draftEvent = makeDraftEvent({
      status: EventStatus.DRAFT,
      endDate: new Date('2020-01-01T18:00:00Z'), // past, so end-date guard passes
    });

    eventRepo.findOne.mockResolvedValue(draftEvent);
    ticketRepo.count.mockResolvedValue(0);

    await expect(
      eventsService.completeEvent(EVENT_ID, ORGANIZER_ID),
    ).rejects.toThrow(BadRequestException);

    // Escrow release must never be attempted for an invalid transition
    expect(escrowService.releaseEscrow).not.toHaveBeenCalled();
  });
});
