import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Validate,
} from 'class-validator';

export enum NotificationChannel {
  PUSH = 'push',
  EMAIL = 'email',
  SMS = 'sms',
  IN_APP = 'in_app',
}

/** Event categories users can toggle per channel. */
export enum NotificationCategory {
  EVENT_REMINDERS = 'eventReminders',
  SCHEDULE_CHANGES = 'scheduleChanges',
  PAYMENT_CONFIRMATIONS = 'paymentConfirmations',
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

@ValidatorConstraint({ name: 'isIanaTimezone', async: false })
export class IsIanaTimezone implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0) return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid IANA timezone (e.g. "America/New_York")`;
  }
}

/**
 * `channels` must map known channels to known categories with boolean values,
 * so arbitrary keys can't be written into the user's jsonb column.
 */
@ValidatorConstraint({ name: 'isChannelPreferenceMap', async: false })
export class IsChannelPreferenceMap implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!isPlainObject(value)) return false;
    const channels = Object.values(NotificationChannel) as string[];
    const categories = Object.values(NotificationCategory) as string[];
    return Object.entries(value).every(
      ([channel, prefs]) =>
        channels.includes(channel) &&
        isPlainObject(prefs) &&
        Object.entries(prefs).every(
          ([category, enabled]) =>
            categories.includes(category) && typeof enabled === 'boolean',
        ),
    );
  }

  defaultMessage(): string {
    return (
      `channels must map ${Object.values(NotificationChannel).join('|')} to ` +
      `{ ${Object.values(NotificationCategory).join('|')}: boolean }`
    );
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class QuietHoursDto {
  @ApiPropertyOptional()
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({
    example: '22:00',
    description: '24h "HH:mm" in the given timezone',
  })
  @IsString()
  @Matches(TIME_PATTERN)
  start: string;

  @ApiPropertyOptional({
    example: '08:00',
    description: '24h "HH:mm" in the given timezone',
  })
  @IsString()
  @Matches(TIME_PATTERN)
  end: string;

  @ApiPropertyOptional({ example: 'America/New_York' })
  @IsString()
  @Validate(IsIanaTimezone)
  timezone: string;
}

export class SaveNotificationPreferencesDto {
  @ApiPropertyOptional({
    description:
      'Per-channel, per-category enabled flags, e.g. { push: { eventReminders: false } }',
    example: {
      push: { eventReminders: false },
      email: { eventReminders: true },
    },
  })
  @IsOptional()
  @IsObject()
  @Validate(IsChannelPreferenceMap)
  channels?: Partial<
    Record<NotificationChannel, Partial<Record<NotificationCategory, boolean>>>
  >;

  @ApiPropertyOptional({ type: QuietHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuietHoursDto)
  quietHours?: QuietHoursDto;
}
