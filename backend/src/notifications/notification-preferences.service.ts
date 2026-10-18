import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  NotificationChannel,
  SaveNotificationPreferencesDto,
} from './dto/save-notification-preferences.dto';

type QuietHours = User['quietHours'];
type RoutableUser = Pick<User, 'channelNotificationPreferences' | 'quietHours'>;

/**
 * Where (and when) a notification should be delivered. `delayMs` is non-zero
 * when the user is currently in quiet hours: the notification is held back
 * until the window ends rather than dropped.
 */
export interface NotificationRoute {
  channels: NotificationChannel[];
  delayMs: number;
}

const MINUTES_PER_DAY = 24 * 60;

@Injectable()
export class NotificationPreferencesService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async getNotificationPreferences(userId: string) {
    const user = await this.findUser(userId);
    return {
      channels: user.channelNotificationPreferences,
      quietHours: user.quietHours,
    };
  }

  async saveNotificationPreferences(
    userId: string,
    dto: SaveNotificationPreferencesDto,
  ) {
    const user = await this.findUser(userId);

    if (dto.channels) {
      const merged = { ...user.channelNotificationPreferences };
      for (const [channel, categories] of Object.entries(dto.channels)) {
        merged[channel] = { ...(merged[channel] ?? {}), ...categories };
      }
      user.channelNotificationPreferences = merged;
    }

    if (dto.quietHours) {
      user.quietHours = { ...user.quietHours, ...dto.quietHours };
    }

    await this.usersRepository.save(user);
    return {
      channels: user.channelNotificationPreferences,
      quietHours: user.quietHours,
    };
  }

  /**
   * Decides which channels a notification in `category` should go out on for
   * this user, and how long to hold it back. A channel is included unless the
   * user disabled that category for it; non-critical notifications raised
   * during quiet hours are deferred until the window ends.
   */
  async routeNotification(
    userId: string,
    category: string,
    critical = false,
  ): Promise<NotificationRoute> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) return { channels: [], delayMs: 0 };
    return this.resolveRoute(user, category, critical);
  }

  /** Same as {@link routeNotification}, for callers that already loaded the user. */
  resolveRoute(
    user: RoutableUser,
    category: string,
    critical = false,
    now: Date = new Date(),
  ): NotificationRoute {
    const channels = Object.values(NotificationChannel).filter(
      (channel) =>
        user.channelNotificationPreferences?.[channel]?.[category] ?? true,
    );
    const delayMs = critical
      ? 0
      : this.msUntilQuietHoursEnd(user.quietHours, now);
    return { channels, delayMs };
  }

  /** True if `now` falls within the given quiet-hours window. */
  enforceQuietHours(
    quietHours: QuietHours | null | undefined,
    now: Date = new Date(),
  ): boolean {
    return this.msUntilQuietHoursEnd(quietHours, now) > 0;
  }

  /**
   * Milliseconds from `now` until the quiet-hours window ends, or 0 when
   * quiet hours are disabled or not currently in effect.
   */
  msUntilQuietHoursEnd(
    quietHours: QuietHours | null | undefined,
    now: Date = new Date(),
  ): number {
    if (!quietHours?.enabled) return 0;

    const start = parseTime(quietHours.start);
    const end = parseTime(quietHours.end);
    if (start === null || end === null || start === end) return 0;

    const current = minutesInTimezone(now, quietHours.timezone);
    const inWindow =
      start < end
        ? current >= start && current < end
        : // Overnight window, e.g. 22:00 -> 08:00
          current >= start || current < end;
    if (!inWindow) return 0;

    const minutesLeft = (end - current + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    // Round up to the start of the `end` minute so we never land inside the window.
    return (
      minutesLeft * 60_000 -
      (now.getUTCSeconds() * 1000 + now.getUTCMilliseconds())
    );
  }

  private async findUser(userId: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }
    return user;
  }
}

function parseTime(value: string | undefined): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Minutes since local midnight in `timezone`, falling back to UTC for unknown zones. */
function minutesInTimezone(now: Date, timezone: string | undefined): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: timezone || 'UTC',
    }).formatToParts(now);
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return (hour % 24) * 60 + minute;
}
