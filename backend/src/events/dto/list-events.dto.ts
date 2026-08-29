import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { EventStatus, EventCategory } from '../entities/event.entity';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListEventsDto {
  @ApiPropertyOptional({ enum: EventStatus, description: 'Filter by event status' })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @ApiPropertyOptional({ description: 'Filter by organizer ID' })
  @IsOptional()
  @IsString()
  organizerId?: string;

  @ApiPropertyOptional({
    description:
      'Full-text search across event title and description (PostgreSQL tsvector)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: EventCategory, description: 'Filter by event category' })
  @IsOptional()
  @IsEnum(EventCategory)
  category?: EventCategory;

  @ApiPropertyOptional({ description: 'Only return events with available capacity' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  showAvailableOnly?: boolean;

  @ApiPropertyOptional({ example: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, description: 'Number of items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Only include events starting on or after this ISO 8601 date',
  })
  @IsOptional()
  @IsDateString()
  startAfter?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Only include events starting on or before this ISO 8601 date',
  })
  @IsOptional()
  @IsDateString()
  startBefore?: string;

  @ApiPropertyOptional({
    enum: ['startDate', 'endDate', 'createdAt', 'title'],
    default: 'startDate',
  })
  @IsOptional()
  @IsIn(['startDate', 'endDate', 'createdAt', 'title'])
  sortBy?: 'startDate' | 'endDate' | 'createdAt' | 'title' = 'startDate';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'asc';

  @ApiPropertyOptional({ description: 'Filter by category IDs (comma-separated UUIDs)' })
  @IsOptional()
  @IsString()
  categoryIds?: string; // comma-separated UUIDs
}
