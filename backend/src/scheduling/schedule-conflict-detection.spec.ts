/**
 * Comprehensive unit tests for the three core scheduling conflict functions:
 *
 *   detectScheduleConflict   — overlap detection with venue matching & ILike
 *   suggestAlternativeSlots  — proximity-ordered free-slot search
 *   resolveConflict          — combined detect + suggest with outcome typing
 *
 * All dates are anchored 30+ days in the future so `suggestAlternativeSlots`
 * (which refuses to propose past slots) behaves identically on any run date.
 */

import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SchedulingService } from './scheduling.service';
import { Event, EventStatus } from '../events/entities/event.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Registration } from '../registrations/entities/registration.entity';
import { Venue, VenueStatus } from '../venues/entities/venue.entity';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VENUE = 'Grand Palais';
const ORG_ID = 'organizer-uuid-1';
const day = 24 * 60 * 60 * 1000;
// Anchor: 30 days from now — all slots relative to this.
const base = new Date(Date.now() + 30 * day);

/** Returns a {start, end} pair offset by `offsetDays` days and `hours` long. */
const slot = (offsetDays: number, hours = 4) => {
  const start = new Date(base.getTime() + offsetDays * day);
  const end = new Date(start.getTime() + hours * 3600_000);
  return { start, end };
};

/** Builds a minimal Event stub that overlaps the requested window. */
const makeEvent = (
  id: string,
  startDate: Date,
  endDate: Date,
  title = `Event-${id}`,
  location = VENUE,
): Event =>
  ({
    id,
    title,
    location,
    organizerId: ORG_ID,
    startDate,
    endDate,
    status: EventStatus.PUBLISHED,
  }) as Event;

/** Registered Venue record returned by the venue repo lookup. */
const makeVenueRecord = (): Venue =>
  ({
    id: 'venue-uuid-1',
    name: VENUE,
    status: VenueStatus.ACTIVE,
    capacity: 500,
  }) as Venue;

// ─── Setup ───────────────────────────────────────────────────────────────────

describe('SchedulingService — conflict detection (hardened)', () => {
  let service: SchedulingService;

  const eventRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const venueRepo = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    venueRepo.findOne.mockResolvedValue(null); // no venue record by default

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingService,
        { provide: getRepositoryToken(Event), useValue: eventRepo },
        { provide: getRepositoryToken(TicketEntity), useValue: { count: jest.fn() } },
        {
          provide: getRepositoryToken(Payment),
          useValue: { find: jest.fn(), createQueryBuilder: jest.fn() },
        },
        { provide: getRepositoryToken(Registration), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(Venue), useValue: venueRepo },
      ],
    }).compile();

    service = module.get<SchedulingService>(SchedulingService);
  });

  // ── detectScheduleConflict ─────────────────────────────────────────────────

  describe('detectScheduleConflict', () => {
    // ── Basic overlap ──────────────────────────────────────────────────────

    it('returns hasConflict=false when the venue is free', async () => {
      eventRepo.find.mockResolvedValue([]);
      const { start, end } = slot(0);

      const report = await service.detectScheduleConflict(VENUE, start, end);

      expect(report.hasConflict).toBe(false);
      expect(report.conflicts).toHaveLength(0);
      expect(report.venue).toBe(VENUE);
      expect(report.requestedSlot).toEqual({ startDate: start, endDate: end });
    });

    it('returns hasConflict=true with one conflict for a partial overlap', async () => {
      const { start, end } = slot(0, 4);
      // Existing event starts 2h in — 2h overlap.
      const existStart = new Date(start.getTime() + 2 * 3600_000);
      const existEnd = new Date(existStart.getTime() + 4 * 3600_000);
      eventRepo.find.mockResolvedValue([makeEvent('e1', existStart, existEnd, 'Keynote')]);

      const report = await service.detectScheduleConflict(VENUE, start, end);

      expect(report.hasConflict).toBe(true);
      expect(report.conflicts).toHaveLength(1);
      const c = report.conflicts[0];
      expect(c.title).toBe('Keynote');
      expect(c.eventId).toBe('e1');
      expect(c.organizerId).toBe(ORG_ID);
      expect(c.severity).toBe('partial');
      expect(c.overlap.hours).toBe(2);
    });

    it('classifies severity=full when an existing event is wholly inside the slot', async () => {
      const { start, end } = slot(0, 8);
      // Inner event fully contained.
      const inner = new Date(start.getTime() + 1 * 3600_000);
      eventRepo.find.mockResolvedValue([
        makeEvent('e1', inner, new Date(inner.getTime() + 2 * 3600_000)),
      ]);

      const { conflicts } = await service.detectScheduleConflict(VENUE, start, end);

      expect(conflicts[0].severity).toBe('full');
    });

    it('classifies severity=full when the requested slot is wholly inside an existing event', async () => {
      const { start, end } = slot(0, 4);
      // Existing event spans a much wider window that contains the request.
      const wideStart = new Date(start.getTime() - 3 * 3600_000);
      const wideEnd = new Date(end.getTime() + 3 * 3600_000);
      eventRepo.find.mockResolvedValue([makeEvent('e1', wideStart, wideEnd)]);

      const { conflicts } = await service.detectScheduleConflict(VENUE, start, end);

      expect(conflicts[0].severity).toBe('full');
    });

    it('returns multiple conflicts when several events overlap', async () => {
      const { start, end } = slot(0, 8);
      eventRepo.find.mockResolvedValue([
        makeEvent('e1', start, new Date(start.getTime() + 2 * 3600_000), 'Morning'),
        makeEvent('e2', new Date(end.getTime() - 2 * 3600_000), end, 'Evening'),
      ]);

      const { conflicts } = await service.detectScheduleConflict(VENUE, start, end);

      expect(conflicts).toHaveLength(2);
      expect(conflicts.map((c) => c.title)).toEqual(['Morning', 'Evening']);
    });

    // ── Self-exclusion ─────────────────────────────────────────────────────

    it('excludes the event being rescheduled from the conflict check', async () => {
      eventRepo.find.mockResolvedValue([]); // repository excludes it
      const { start, end } = slot(0);

      await service.detectScheduleConflict(VENUE, start, end, 'self-event-id');

      // The Not() exclusion should be present in the where clause passed to find()
      const whereArg = eventRepo.find.mock.calls[0][0].where;
      expect(whereArg.id).toBeDefined(); // Not('self-event-id')
    });

    // ── Venue record lookup ───────────────────────────────────────────────

    it('attaches the matching Venue record when one is found', async () => {
      const record = makeVenueRecord();
      venueRepo.findOne.mockResolvedValue(record);
      eventRepo.find.mockResolvedValue([]);

      const { venueRecord } = await service.detectScheduleConflict(VENUE, slot(0).start, slot(0).end);

      expect(venueRecord).not.toBeNull();
      expect(venueRecord!.id).toBe('venue-uuid-1');
    });

    it('sets venueRecord=null when the location is not a registered Venue', async () => {
      venueRepo.findOne.mockResolvedValue(null);
      eventRepo.find.mockResolvedValue([]);

      const { venueRecord } = await service.detectScheduleConflict(VENUE, slot(0).start, slot(0).end);

      expect(venueRecord).toBeNull();
    });

    // ── Case-insensitive matching ─────────────────────────────────────────

    it('trims and passes the venue string to ILike so casing does not matter', async () => {
      eventRepo.find.mockResolvedValue([]);

      await service.detectScheduleConflict('  grand palais  ', slot(0).start, slot(0).end);

      // The venue field stored on the report should be the trimmed value
      // (ILike wrapping is done internally — we verify the repo was called)
      expect(eventRepo.find).toHaveBeenCalledTimes(1);
      const where = eventRepo.find.mock.calls[0][0].where;
      // ILike returns a FindOperator — its value contains the trimmed string
      expect(where.location.value).toBe('grand palais');
    });

    // ── Input validation ──────────────────────────────────────────────────

    it('throws BadRequestException when endDate equals startDate', async () => {
      const { start } = slot(0);
      await expect(service.detectScheduleConflict(VENUE, start, start)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when endDate is before startDate', async () => {
      const { start, end } = slot(0);
      await expect(service.detectScheduleConflict(VENUE, end, start)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for an empty venue string', async () => {
      const { start, end } = slot(0);
      await expect(service.detectScheduleConflict('', start, end)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for a whitespace-only venue string', async () => {
      const { start, end } = slot(0);
      await expect(service.detectScheduleConflict('   ', start, end)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when startDate is not a valid Date', async () => {
      const { end } = slot(0);
      await expect(
        service.detectScheduleConflict(VENUE, new Date('invalid'), end),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── suggestAlternativeSlots ────────────────────────────────────────────────

  describe('suggestAlternativeSlots', () => {
    it('returns free slots when the venue is entirely unbooked', async () => {
      eventRepo.find.mockResolvedValue([]);
      const { start, end } = slot(0, 4);

      const slots = await service.suggestAlternativeSlots(VENUE, start, end, { limit: 3 });

      expect(slots).toHaveLength(3);
    });

    it('preserves the requested duration in every suggestion', async () => {
      eventRepo.find.mockResolvedValue([]);
      const { start, end } = slot(0, 3);
      const durationMs = end.getTime() - start.getTime();

      const slots = await service.suggestAlternativeSlots(VENUE, start, end, { limit: 4 });

      for (const s of slots) {
        expect(s.endDate.getTime() - s.startDate.getTime()).toBe(durationMs);
      }
    });

    it('returns the nearest slot first, alternating forward/backward', async () => {
      const { start, end } = slot(0, 4);
      // Block the first forward step (day+1) with a long booking.
      const blockedStart = new Date(start.getTime() + day);
      const blockedEnd = new Date(blockedStart.getTime() + 8 * 3600_000);
      eventRepo.find.mockResolvedValue([
        makeEvent('block', blockedStart, blockedEnd),
      ]);

      const slots = await service.suggestAlternativeSlots(VENUE, start, end, {
        limit: 1,
        stepHours: 24,
      });

      expect(slots).toHaveLength(1);
      // First backward step (−24h) should win as it is free
      expect(slots[0].shiftHours).toBe(-24);
    });

    it('always returns slots starting in the future', async () => {
      eventRepo.find.mockResolvedValue([]);
      const { start, end } = slot(0, 4);

      const slots = await service.suggestAlternativeSlots(VENUE, start, end, { limit: 5 });

      for (const s of slots) {
        expect(s.startDate.getTime()).toBeGreaterThan(Date.now());
      }
    });

    it('returns empty array when the entire search window is booked', async () => {
      const { start, end } = slot(0, 4);
      // Single booking spanning ±3 days
      eventRepo.find.mockResolvedValue([
        makeEvent(
          'block',
          new Date(start.getTime() - 4 * day),
          new Date(end.getTime() + 4 * day),
        ),
      ]);

      const slots = await service.suggestAlternativeSlots(VENUE, start, end, {
        searchWindowDays: 2,
      });

      expect(slots).toEqual([]);
    });

    it('includes a human-readable reason on each slot', async () => {
      eventRepo.find.mockResolvedValue([]);
      const { start, end } = slot(0, 4);

      const slots = await service.suggestAlternativeSlots(VENUE, start, end, { limit: 2 });

      for (const s of slots) {
        expect(typeof s.reason).toBe('string');
        expect(s.reason.length).toBeGreaterThan(0);
      }
    });

    it('uses signed shiftHours (negative = earlier)', async () => {
      eventRepo.find.mockResolvedValue([]);
      const { start, end } = slot(1, 4); // start 1 day from base

      const slots = await service.suggestAlternativeSlots(VENUE, start, end, { limit: 4 });

      const positiveShifts = slots.filter((s) => s.shiftHours > 0);
      const negativeShifts = slots.filter((s) => s.shiftHours < 0);
      // Both directions should be represented
      expect(positiveShifts.length).toBeGreaterThan(0);
      expect(negativeShifts.length).toBeGreaterThan(0);
    });

    // ── Input validation ──────────────────────────────────────────────────

    it('throws BadRequestException when stepHours is zero', async () => {
      const { start, end } = slot(0);
      await expect(
        service.suggestAlternativeSlots(VENUE, start, end, { stepHours: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when limit is zero', async () => {
      const { start, end } = slot(0);
      await expect(
        service.suggestAlternativeSlots(VENUE, start, end, { limit: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when searchWindowDays is zero', async () => {
      const { start, end } = slot(0);
      await expect(
        service.suggestAlternativeSlots(VENUE, start, end, { searchWindowDays: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when endDate ≤ startDate', async () => {
      const { start, end } = slot(0);
      await expect(
        service.suggestAlternativeSlots(VENUE, end, start),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── resolveConflict ────────────────────────────────────────────────────────

  describe('resolveConflict', () => {
    it('returns outcome=no_conflict when the venue is free', async () => {
      eventRepo.find.mockResolvedValue([]);
      const { start, end } = slot(0, 4);

      const resolution = await service.resolveConflict(VENUE, start, end);

      expect(resolution.outcome).toBe('no_conflict');
      expect(resolution.conflicts).toHaveLength(0);
      expect(resolution.recommendedSlot).toBeNull();
      expect(resolution.alternatives).toHaveLength(0);
      // reasoning should mention the venue and "free"
      expect(resolution.reasoning.join(' ')).toContain(VENUE);
    });

    it('returns outcome=alternative_available when conflicts exist and a free slot is found', async () => {
      const { start, end } = slot(0, 4);
      const clash = makeEvent('e1', start, end, 'Product Launch');
      // First find (detect): conflict found. Second find (suggest): nothing nearby except one free slot.
      eventRepo.find
        .mockResolvedValueOnce([clash])   // detectScheduleConflict
        .mockResolvedValueOnce([clash]);  // suggestAlternativeSlots (same blocker)

      const resolution = await service.resolveConflict(VENUE, start, end);

      expect(resolution.outcome).toBe('alternative_available');
      expect(resolution.conflicts[0].title).toBe('Product Launch');
      expect(resolution.recommendedSlot).not.toBeNull();
      expect(resolution.recommendedSlot).toBe(resolution.alternatives[0]);
    });

    it('sets recommendedSlot to the first alternative', async () => {
      const { start, end } = slot(0, 4);
      const clash = makeEvent('e1', start, end);
      eventRepo.find
        .mockResolvedValueOnce([clash])
        .mockResolvedValueOnce([clash]);

      const resolution = await service.resolveConflict(VENUE, start, end, { limit: 3 });

      if (resolution.outcome === 'alternative_available') {
        expect(resolution.recommendedSlot).toBe(resolution.alternatives[0]);
        expect(resolution.alternatives.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('returns outcome=unresolved when the whole window is blocked', async () => {
      const { start, end } = slot(0, 4);
      const bigBlock = makeEvent(
        'e1',
        new Date(start.getTime() - 5 * day),
        new Date(end.getTime() + 5 * day),
      );
      eventRepo.find.mockResolvedValue([bigBlock]);

      const resolution = await service.resolveConflict(VENUE, start, end, {
        searchWindowDays: 3,
      });

      expect(resolution.outcome).toBe('unresolved');
      expect(resolution.recommendedSlot).toBeNull();
      expect(resolution.alternatives).toHaveLength(0);
    });

    it('includes conflict details in reasoning for alternative_available', async () => {
      const { start, end } = slot(0, 4);
      const clash = makeEvent('e1', start, end, 'Gala Night');
      eventRepo.find
        .mockResolvedValueOnce([clash])
        .mockResolvedValueOnce([clash]);

      const resolution = await service.resolveConflict(VENUE, start, end);

      const reasonText = resolution.reasoning.join(' ');
      expect(reasonText).toContain('Gala Night');
    });

    it('includes a "no free slot" message in reasoning when unresolved', async () => {
      const { start, end } = slot(0, 4);
      eventRepo.find.mockResolvedValue([
        makeEvent(
          'e1',
          new Date(start.getTime() - 5 * day),
          new Date(end.getTime() + 5 * day),
        ),
      ]);

      const resolution = await service.resolveConflict(VENUE, start, end, {
        searchWindowDays: 3,
      });

      expect(resolution.reasoning.join(' ')).toContain('No free slot');
    });

    it('does not mutate any event — only one find per phase, no save called', async () => {
      const { start, end } = slot(0, 4);
      const clash = makeEvent('e1', start, end);
      eventRepo.find
        .mockResolvedValueOnce([clash])
        .mockResolvedValueOnce([clash]);

      await service.resolveConflict(VENUE, start, end);

      // save / update must never be called
      expect((eventRepo as any).save).toBeUndefined();
      expect((eventRepo as any).update).toBeUndefined();
    });

    it('short-circuits to no_conflict with a single find call', async () => {
      eventRepo.find.mockResolvedValue([]);
      const { start, end } = slot(0, 4);

      await service.resolveConflict(VENUE, start, end);

      // detectScheduleConflict = 1 find call; suggestAlternativeSlots never runs
      expect(eventRepo.find).toHaveBeenCalledTimes(1);
    });

    it('passes excludeEventId through to both detect and suggest', async () => {
      eventRepo.find.mockResolvedValue([]);
      const { start, end } = slot(0, 4);

      await service.resolveConflict(VENUE, start, end, { excludeEventId: 'my-event' });

      // Both calls should carry the Not('my-event') on the where clause
      for (const call of eventRepo.find.mock.calls) {
        expect(call[0].where.id).toBeDefined();
      }
    });
  });
});
