import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NotificationPreferencesService } from './notification-preferences.service';
import {
  NotificationChannel,
  SaveNotificationPreferencesDto,
} from './dto/save-notification-preferences.dto';

const quiet = (start: string, end: string, timezone = 'UTC') => ({
  enabled: true,
  start,
  end,
  timezone,
});

describe('NotificationPreferencesService', () => {
  let repo: { findOne: jest.Mock; save: jest.Mock };
  let service: NotificationPreferencesService;

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((u: unknown) => Promise.resolve(u)),
    };
    service = new NotificationPreferencesService(repo as any);
  });

  describe('saveNotificationPreferences', () => {
    it('merges channel toggles and quiet hours into existing preferences', async () => {
      repo.findOne.mockResolvedValue({
        id: 'u1',
        channelNotificationPreferences: {
          email: { eventReminders: true, scheduleChanges: true },
        },
        quietHours: {
          enabled: false,
          start: '22:00',
          end: '08:00',
          timezone: 'UTC',
        },
      });

      const result = await service.saveNotificationPreferences('u1', {
        channels: {
          email: { scheduleChanges: false },
          sms: { eventReminders: false },
        },
        quietHours: quiet('23:00', '07:00', 'Europe/London'),
      });

      expect(result.channels).toEqual({
        email: { eventReminders: true, scheduleChanges: false },
        sms: { eventReminders: false },
      });
      expect(result.quietHours).toEqual(
        quiet('23:00', '07:00', 'Europe/London'),
      );
      expect(repo.save).toHaveBeenCalled();
    });

    it('throws when the user does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.saveNotificationPreferences('missing', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('enforceQuietHours', () => {
    it('is false when quiet hours are disabled', () => {
      expect(
        service.enforceQuietHours({
          ...quiet('00:00', '23:59'),
          enabled: false,
        }),
      ).toBe(false);
    });

    it('handles same-day windows', () => {
      const window = quiet('09:00', '17:00');
      expect(
        service.enforceQuietHours(window, new Date('2026-01-01T12:00:00Z')),
      ).toBe(true);
      expect(
        service.enforceQuietHours(window, new Date('2026-01-01T17:00:00Z')),
      ).toBe(false);
      expect(
        service.enforceQuietHours(window, new Date('2026-01-01T08:59:00Z')),
      ).toBe(false);
    });

    it('handles overnight windows that wrap past midnight', () => {
      const window = quiet('22:00', '08:00');
      expect(
        service.enforceQuietHours(window, new Date('2026-01-01T23:30:00Z')),
      ).toBe(true);
      expect(
        service.enforceQuietHours(window, new Date('2026-01-01T00:00:00Z')),
      ).toBe(true);
      expect(
        service.enforceQuietHours(window, new Date('2026-01-01T07:59:00Z')),
      ).toBe(true);
      expect(
        service.enforceQuietHours(window, new Date('2026-01-01T12:00:00Z')),
      ).toBe(false);
    });

    it('evaluates the window in the user timezone', () => {
      // 03:00 UTC is 22:00 the previous day in New York (UTC-5 in January).
      const window = quiet('21:00', '23:00', 'America/New_York');
      expect(
        service.enforceQuietHours(window, new Date('2026-01-01T03:00:00Z')),
      ).toBe(true);
      expect(
        service.enforceQuietHours(window, new Date('2026-01-01T22:00:00Z')),
      ).toBe(false);
    });

    it('falls back to UTC instead of throwing on an unknown timezone', () => {
      const window = quiet('09:00', '17:00', 'Not/AZone');
      expect(
        service.enforceQuietHours(window, new Date('2026-01-01T12:00:00Z')),
      ).toBe(true);
    });
  });

  describe('msUntilQuietHoursEnd', () => {
    it('returns the time remaining until the window closes', () => {
      const window = quiet('22:00', '08:00');
      expect(
        service.msUntilQuietHoursEnd(window, new Date('2026-01-01T07:30:00Z')),
      ).toBe(30 * 60_000);
      expect(
        service.msUntilQuietHoursEnd(window, new Date('2026-01-01T23:00:30Z')),
      ).toBe(9 * 60 * 60_000 - 30_000);
    });

    it('returns 0 outside the window', () => {
      expect(
        service.msUntilQuietHoursEnd(
          quiet('22:00', '08:00'),
          new Date('2026-01-01T12:00:00Z'),
        ),
      ).toBe(0);
    });
  });

  describe('routeNotification', () => {
    const now = new Date('2026-01-01T23:00:00Z');

    it('returns every channel that has not disabled the category', async () => {
      repo.findOne.mockResolvedValue({
        channelNotificationPreferences: {
          push: { eventReminders: false },
          sms: { eventReminders: false, scheduleChanges: true },
        },
        quietHours: { enabled: false },
      });

      const route = await service.routeNotification('u1', 'eventReminders');

      expect(route.channels).toEqual([
        NotificationChannel.EMAIL,
        NotificationChannel.IN_APP,
      ]);
      expect(route.delayMs).toBe(0);
    });

    it('defers non-critical notifications during quiet hours', () => {
      const route = service.resolveRoute(
        {
          channelNotificationPreferences: {},
          quietHours: quiet('22:00', '08:00'),
        },
        'eventReminders',
        false,
        now,
      );
      expect(route.channels).toHaveLength(4);
      expect(route.delayMs).toBe(9 * 60 * 60_000);
    });

    it('lets critical notifications through during quiet hours', () => {
      const route = service.resolveRoute(
        {
          channelNotificationPreferences: {},
          quietHours: quiet('22:00', '08:00'),
        },
        'paymentConfirmations',
        true,
        now,
      );
      expect(route.delayMs).toBe(0);
    });

    it('routes nowhere for an unknown user', async () => {
      repo.findOne.mockResolvedValue(null);
      expect(
        await service.routeNotification('missing', 'eventReminders'),
      ).toEqual({
        channels: [],
        delayMs: 0,
      });
    });
  });
});

describe('SaveNotificationPreferencesDto', () => {
  const errorsFor = (body: unknown) =>
    validate(plainToInstance(SaveNotificationPreferencesDto, body));

  it('accepts known channels, categories and a valid timezone', async () => {
    expect(
      await errorsFor({
        channels: {
          push: { eventReminders: false },
          in_app: { paymentConfirmations: true },
        },
        quietHours: quiet('22:00', '08:00', 'America/New_York'),
      }),
    ).toHaveLength(0);
  });

  it.each([
    [{ channels: { fax: { eventReminders: true } } }],
    [{ channels: { push: { madeUpCategory: true } } }],
    [{ channels: { push: { eventReminders: 'yes' } } }],
    [{ channels: { push: ['eventReminders'] } }],
  ])('rejects malformed channel maps: %j', async (body) => {
    expect(await errorsFor(body)).not.toHaveLength(0);
  });

  it('rejects an unknown timezone', async () => {
    expect(
      await errorsFor({ quietHours: quiet('22:00', '08:00', 'Mars/Olympus') }),
    ).not.toHaveLength(0);
  });
});
