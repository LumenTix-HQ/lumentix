import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SchedulingService } from './scheduling.service';
import { Event, EventStatus } from '../events/entities/event.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Registration } from '../registrations/entities/registration.entity';

/**
 * Conflict detection for issue #987. All dates are pushed into the future
 * relative to "now" so that `suggestAlternativeSlots`, which refuses to
 * propose a slot in the past, behaves the same whenever the suite runs.
 */
describe('SchedulingService — venue conflicts', () => {
  let service: SchedulingService;

  const mockEventRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const VENUE = 'Moscone Center';
  const day = 24 * 60 * 60 * 1000;
  const base = new Date(Date.now() + 30 * day);

  /** A slot `offsetDays` from the base date, lasting `hours`. */
  const slot = (offsetDays: number, hours = 4) => {
    const start = new Date(base.getTime() + offsetDays * day);
    return { start, end: new Date(start.getTime() + hours * 60 * 60 * 1000) };
  };

  const event = (
    id: string,
    startDate: Date,
    endDate: Date,
    title = `Event ${id}`,
  ) =>
    ({
      id,
      title,
      location: VENUE,
      startDate,
      endDate,
      status: EventStatus.PUBLISHED,
    }) as Event;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingService,
        { provide: getRepositoryToken(Event), useValue: mockEventRepository },
        { provide: getRepositoryToken(TicketEntity), useValue: { count: jest.fn() } },
        {
          provide: getRepositoryToken(Payment),
          useValue: { find: jest.fn(), createQueryBuilder: jest.fn() },
        },
        { provide: getRepositoryToken(Registration), useValue: { find: jest.fn() } },
      ],
    }).compile();

    service = module.get<SchedulingService>(SchedulingService);
  });

  describe('detectScheduleConflict', () => {
    it('reports no conflict when the venue is free', async () => {
      mockEventRepository.find.mockResolvedValue([]);
      const { start, end } = slot(0);

      const report = await service.detectScheduleConflict(VENUE, start, end);

      expect(report.hasConflict).toBe(false);
      expect(report.conflicts).toEqual([]);
      expect(report.venue).toBe(VENUE);
    });

    it('reports the overlapping window, not the whole conflicting booking', async () => {
      const { start, end } = slot(0, 4);
      // Existing booking starts 2h in and runs 4h — a 2h overlap.
      const existingStart = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      const existingEnd = new Date(existingStart.getTime() + 4 * 60 * 60 * 1000);
      mockEventRepository.find.mockResolvedValue([
        event('e1', existingStart, existingEnd, 'Keynote'),
      ]);

      const report = await service.detectScheduleConflict(VENUE, start, end);

      expect(report.hasConflict).toBe(true);
      expect(report.conflicts).toHaveLength(1);
      expect(report.conflicts[0].title).toBe('Keynote');
      expect(report.conflicts[0].overlap.hours).toBe(2);
      expect(report.conflicts[0].severity).toBe('partial');
    });

    it('marks an enclosed booking as a full overlap', async () => {
      const { start, end } = slot(0, 8);
      const inner = new Date(start.getTime() + 1 * 60 * 60 * 1000);
      mockEventRepository.find.mockResolvedValue([
        event('e1', inner, new Date(inner.getTime() + 2 * 60 * 60 * 1000)),
      ]);

      const report = await service.detectScheduleConflict(VENUE, start, end);

      expect(report.conflicts[0].severity).toBe('full');
    });

    it('queries only the venue, and only bookings that hold it', async () => {
      mockEventRepository.find.mockResolvedValue([]);
      const { start, end } = slot(0);

      await service.detectScheduleConflict(VENUE, start, end, 'self-id');

      const where = mockEventRepository.find.mock.calls[0][0].where;
      expect(where.location).toBe(VENUE);
      // Draft and cancelled events do not hold the venue.
      expect(where.status.value).toEqual([
        EventStatus.PUBLISHED,
        EventStatus.COMPLETED,
      ]);
      // The event being rescheduled must not conflict with itself.
      expect(where.id).toBeDefined();
    });

    it('rejects a slot that ends before it starts', async () => {
      const { start, end } = slot(0);
      await expect(
        service.detectScheduleConflict(VENUE, end, start),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a zero-length slot', async () => {
      const { start } = slot(0);
      await expect(
        service.detectScheduleConflict(VENUE, start, start),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('suggestAlternativeSlots', () => {
    it('returns the closest free slot first, in either direction', async () => {
      const { start, end } = slot(0, 4);
      // The day after is taken; the day before is free.
      const takenStart = new Date(start.getTime() + day);
      mockEventRepository.find.mockResolvedValue([
        event('e1', takenStart, new Date(takenStart.getTime() + 6 * 60 * 60 * 1000)),
      ]);

      const slots = await service.suggestAlternativeSlots(VENUE, start, end, {
        limit: 2,
      });

      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0].shiftHours).toBe(-24);
      expect(slots.every((s) => s.startDate.getTime() > Date.now())).toBe(true);
    });

    it('preserves the requested duration in every suggestion', async () => {
      const { start, end } = slot(0, 3);
      mockEventRepository.find.mockResolvedValue([]);

      const slots = await service.suggestAlternativeSlots(VENUE, start, end, {
        limit: 3,
      });

      const requested = end.getTime() - start.getTime();
      expect(slots).toHaveLength(3);
      for (const s of slots) {
        expect(s.endDate.getTime() - s.startDate.getTime()).toBe(requested);
      }
    });

    it('returns nothing when the whole search window is booked', async () => {
      const { start, end } = slot(0, 4);
      // One booking spanning the entire ±2 day window.
      mockEventRepository.find.mockResolvedValue([
        event(
          'e1',
          new Date(start.getTime() - 3 * day),
          new Date(end.getTime() + 3 * day),
        ),
      ]);

      const slots = await service.suggestAlternativeSlots(VENUE, start, end, {
        searchWindowDays: 2,
      });

      expect(slots).toEqual([]);
    });

    it('rejects non-positive search parameters', async () => {
      const { start, end } = slot(0);
      await expect(
        service.suggestAlternativeSlots(VENUE, start, end, { stepHours: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('resolveConflict', () => {
    it('short-circuits when there is nothing to resolve', async () => {
      mockEventRepository.find.mockResolvedValue([]);
      const { start, end } = slot(0);

      const resolution = await service.resolveConflict(VENUE, start, end);

      expect(resolution.outcome).toBe('no_conflict');
      expect(resolution.recommendedSlot).toBeNull();
      // Only the conflict check runs — no alternatives are searched for.
      expect(mockEventRepository.find).toHaveBeenCalledTimes(1);
    });

    it('recommends the nearest free slot when the venue is taken', async () => {
      const { start, end } = slot(0, 4);
      const clash = event('e1', start, end, 'Product Launch');
      mockEventRepository.find.mockResolvedValue([clash]);

      const resolution = await service.resolveConflict(VENUE, start, end);

      expect(resolution.outcome).toBe('alternative_available');
      expect(resolution.conflicts[0].title).toBe('Product Launch');
      expect(resolution.recommendedSlot).not.toBeNull();
      expect(resolution.recommendedSlot).toBe(resolution.alternatives[0]);
      expect(resolution.reasoning.join(' ')).toContain('Product Launch');
    });

    it('reports unresolved when no alternative exists in the window', async () => {
      const { start, end } = slot(0, 4);
      mockEventRepository.find.mockResolvedValue([
        event(
          'e1',
          new Date(start.getTime() - 5 * day),
          new Date(end.getTime() + 5 * day),
        ),
      ]);

      const resolution = await service.resolveConflict(VENUE, start, end, {
        searchWindowDays: 3,
      });

      expect(resolution.outcome).toBe('unresolved');
      expect(resolution.recommendedSlot).toBeNull();
      expect(resolution.alternatives).toEqual([]);
    });

    it('does not mutate any booking — resolution is a plan, not an action', async () => {
      const { start, end } = slot(0, 4);
      mockEventRepository.find.mockResolvedValue([event('e1', start, end)]);

      await service.resolveConflict(VENUE, start, end);

      expect(mockEventRepository.findOne).not.toHaveBeenCalled();
      expect(
        (mockEventRepository as Record<string, unknown>).save,
      ).toBeUndefined();
    });
  });
});
