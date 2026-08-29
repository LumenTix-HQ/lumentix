import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { NotificationChannel, SaveNotificationPreferencesDto } from './dto/save-notification-preferences.dto';

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

  async saveNotificationPreferences(userId: string, dto: SaveNotificationPreferencesDto) {
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
    return { channels: user.channelNotificationPreferences, quietHours: user.quietHours };
  }

  /**
   * Decides which channels a notification in `category` should go out on for
   * this user: a channel is included when the user hasn't disabled that
   * category for it, and — unless the notification is critical — the user
   * isn't currently in quiet hours.
   */
  async routeNotification(
    userId: string,
    category: string,
    critical = false,
  ): Promise<NotificationChannel[]> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) return [];

    const suppressed = !critical && this.enforceQuietHours(user.quietHours);

    return Object.values(NotificationChannel).filter((channel) => {
      const enabled = user.channelNotificationPreferences?.[channel]?.[category] ?? true;
      return enabled && !suppressed;
    });
  }

  /** True if "now" falls within the given quiet-hours window. */
  enforceQuietHours(quietHours: User['quietHours'] | null | undefined): boolean {
    if (!quietHours?.enabled) return false;

    const { start, end, timezone } = quietHours;
    if (!start || !end || start === end) return false;

    const current = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone || 'UTC',
    }).format(new Date());

    if (start < end) {
      return current >= start && current < end;
    }
    // Overnight window, e.g. 22:00 -> 08:00
    return current >= start || current < end;
  }

  private async findUser(userId: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }
    return user;
  }
}
