import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detect_schedule_conflict,
  suggest_alternative_slots,
  resolve_conflict,
  schedulingService,
} from '@/lib/scheduling';

describe('scheduling conflict functions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const VENUE = 'Grand Palais';
  const start = '2026-12-01T10:00:00.000Z';
  const end = '2026-12-01T14:00:00.000Z';

  describe('detect_schedule_conflict', () => {
    it('sends POST request to /scheduling/detect-conflict', async () => {
      const mockReport = {
        hasConflict: false,
        venue: VENUE,
        requestedSlot: { startDate: start, endDate: end },
        conflicts: [],
      };

      const spy = vi
        .spyOn(schedulingService as any, 'request')
        .mockResolvedValueOnce(mockReport);

      const result = await detect_schedule_conflict(VENUE, start, end, 'ex-123');

      expect(spy).toHaveBeenCalledWith('/scheduling/detect-conflict', {
        method: 'POST',
        body: JSON.stringify({
          venue: VENUE,
          startDate: start,
          endDate: end,
          excludeEventId: 'ex-123',
        }),
      });
      expect(result).toBe(mockReport);
    });
  });

  describe('suggest_alternative_slots', () => {
    it('sends POST request to /scheduling/alternative-slots with options', async () => {
      const mockSlots = [
        {
          startDate: '2026-12-02T10:00:00.000Z',
          endDate: '2026-12-02T14:00:00.000Z',
          shiftHours: 24,
          reason: 'Venue is free 24h after the requested slot',
        },
      ];

      const spy = vi
        .spyOn(schedulingService as any, 'request')
        .mockResolvedValueOnce(mockSlots);

      const result = await suggest_alternative_slots(VENUE, start, end, {
        limit: 2,
        stepHours: 12,
        searchWindowDays: 7,
      });

      expect(spy).toHaveBeenCalledWith('/scheduling/alternative-slots', {
        method: 'POST',
        body: JSON.stringify({
          venue: VENUE,
          startDate: start,
          endDate: end,
          limit: 2,
          stepHours: 12,
          searchWindowDays: 7,
        }),
      });
      expect(result).toBe(mockSlots);
    });
  });

  describe('resolve_conflict', () => {
    it('sends POST request to /scheduling/resolve-conflict', async () => {
      const mockResolution = {
        outcome: 'no_conflict' as const,
        conflicts: [],
        recommendedSlot: null,
        alternatives: [],
        reasoning: ['Venue is free for the requested slot.'],
      };

      const spy = vi
        .spyOn(schedulingService as any, 'request')
        .mockResolvedValueOnce(mockResolution);

      const result = await resolve_conflict(VENUE, start, end);

      expect(spy).toHaveBeenCalledWith('/scheduling/resolve-conflict', {
        method: 'POST',
        body: JSON.stringify({
          venue: VENUE,
          startDate: start,
          endDate: end,
        }),
      });
      expect(result).toBe(mockResolution);
    });
  });
});
