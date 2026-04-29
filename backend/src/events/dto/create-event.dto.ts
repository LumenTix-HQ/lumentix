import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsNumber,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { EventStatus, EventCategory } from '../entities/event.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEventDto {
  @ApiProperty({ example: 'Stellar Developer Day', description: 'Event title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: 'A conference for Stellar devs', description: 'Event description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'Lagos, Nigeria', description: 'Event location' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({ example: '2025-09-15T09:00:00Z', description: 'ISO 8601 start datetime' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2025-09-15T18:00:00Z', description: 'ISO 8601 end datetime' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ example: 10.5, description: 'Ticket price in the event currency' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  ticketPrice?: number;

  @ApiPropertyOptional({ example: 'XLM', description: 'Currency code' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ enum: EventStatus, description: 'Status of the event' })
  @IsEnum(EventStatus)
  @IsOptional()
  status?: EventStatus;

  /**
   * Maximum number of tickets that can be sold for this event.
   * Omit or set to null for unlimited capacity.
   */
  @ApiPropertyOptional({ example: 100, description: 'Maximum capacity' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttendees?: number;

  @ApiPropertyOptional({ enum: EventCategory, description: 'Event category' })
  @IsOptional()
  @IsEnum(EventCategory)
  category?: EventCategory;
}
