import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEmailCampaignDto {
  @ApiPropertyOptional({
    example: '3f1e2d4a-...',
    description: 'Scope recipients to a specific event (omit for all events)',
  })
  @IsUUID()
  @IsOptional()
  eventId?: string;

  @ApiProperty({ example: 'Join us for our next event!', description: 'Email subject line' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({
    example: '<h1>Hello {{name}}</h1><p>We have exciting news…</p>',
    description: 'HTML body of the newsletter',
  })
  @IsString()
  @IsNotEmpty()
  bodyHtml: string;

  @ApiPropertyOptional({
    example: '2026-08-01T09:00:00Z',
    description: 'Optional scheduled send time (ISO 8601)',
  })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}
