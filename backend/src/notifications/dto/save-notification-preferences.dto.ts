import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsObject, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

export enum NotificationChannel {
  PUSH = 'push',
  EMAIL = 'email',
  SMS = 'sms',
  IN_APP = 'in_app',
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class QuietHoursDto {
  @ApiPropertyOptional()
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ example: '22:00', description: '24h "HH:mm" in the given timezone' })
  @IsString()
  @Matches(TIME_PATTERN)
  start: string;

  @ApiPropertyOptional({ example: '08:00', description: '24h "HH:mm" in the given timezone' })
  @IsString()
  @Matches(TIME_PATTERN)
  end: string;

  @ApiPropertyOptional({ example: 'America/New_York' })
  @IsString()
  timezone: string;
}

export class SaveNotificationPreferencesDto {
  @ApiPropertyOptional({
    description: 'Per-channel, per-category enabled flags, e.g. { push: { eventReminder: false } }',
    example: { push: { eventReminder: false }, email: { eventReminder: true } },
  })
  @IsOptional()
  @IsObject()
  channels?: Partial<Record<NotificationChannel, Record<string, boolean>>>;

  @ApiPropertyOptional({ type: QuietHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuietHoursDto)
  quietHours?: QuietHoursDto;
}
