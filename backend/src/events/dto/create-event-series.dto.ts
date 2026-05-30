import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsNumber,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { EventCategory, EventAgeRestriction } from '../entities/event.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEventSeriesDto {
  @ApiProperty({ example: 'Tech Weekly Meetup', description: 'Series title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: 'Weekly tech gatherings', description: 'Series description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'Lagos, Nigeria', description: 'Series location' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({ example: '2025-09-15T09:00:00Z', description: 'ISO 8601 start datetime of the first event' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2025-09-15T18:00:00Z', description: 'ISO 8601 end datetime of the first event' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ example: 10.5, description: 'Ticket price in the currency' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  ticketPrice?: number;

  @ApiPropertyOptional({ example: 'XLM', description: 'Currency code' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: 100, description: 'Maximum capacity per event' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttendees?: number;

  @ApiPropertyOptional({ enum: EventCategory, description: 'Event category' })
  @IsOptional()
  @IsEnum(EventCategory)
  category?: EventCategory;

  @ApiPropertyOptional({ enum: EventAgeRestriction, description: 'Age restriction' })
  @IsOptional()
  @IsEnum(EventAgeRestriction)
  ageRestriction?: EventAgeRestriction;

  @ApiProperty({ example: 'weekly', description: 'Recurrence pattern' })
  @IsString()
  @IsNotEmpty()
  recurrencePattern: 'weekly' | 'monthly' | 'annually';

  @ApiPropertyOptional({ example: 5, description: 'Number of occurrences' })
  @IsInt()
  @Min(1)
  @Max(52)
  @IsOptional()
  occurrencesCount?: number;

  @ApiPropertyOptional({ example: 40, description: 'Season pass price' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  seasonPassPrice?: number;

  @ApiPropertyOptional({ example: 15, description: 'Discount percentage for subsequent events' })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  discountPercentage?: number;

  @ApiPropertyOptional({ example: 'https://example.com/image.png', description: 'Image URL' })
  @IsString()
  @IsOptional()
  imageUrl?: string;
}
