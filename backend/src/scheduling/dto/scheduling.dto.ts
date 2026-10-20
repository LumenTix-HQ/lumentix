import {
  IsEnum,
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsDateString,
  IsUUID,
  IsBoolean,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventCategory } from '../../events/entities/event.entity';

// ─── Shared sub-objects ────────────────────────────────────────────────────────

export class DateRangeDto {
  @ApiProperty({ example: '2026-10-01T09:00:00Z' })
  @IsDateString()
  start: string;

  @ApiProperty({ example: '2026-10-30T18:00:00Z' })
  @IsDateString()
  end: string;
}

// ─── Existing scheduling DTOs ─────────────────────────────────────────────────

export class AnalyzeOptimalTimingDto {
  @ApiProperty({ enum: EventCategory })
  @IsEnum(EventCategory)
  category: EventCategory;

  @ApiProperty({ example: 'Moscone Center', description: 'Venue / location string' })
  @IsString()
  @IsNotEmpty()
  location: string;

  @ApiProperty({ description: 'Event duration in hours', example: 8 })
  @IsNumber()
  @Min(0.5)
  duration: number;

  @ApiPropertyOptional({ example: 'young-adults' })
  @IsOptional()
  @IsString()
  targetAudience?: string;
}

export class SuggestEventScheduleDto {
  @ApiProperty({ enum: EventCategory })
  @IsEnum(EventCategory)
  category: EventCategory;

  @ApiProperty({ example: 'Moscone Center' })
  @IsString()
  @IsNotEmpty()
  location: string;

  @ApiProperty({ description: 'Event duration in hours', example: 4 })
  @IsNumber()
  @Min(0.5)
  duration: number;

  @ApiProperty({ type: DateRangeDto, description: 'Date range to search within' })
  @ValidateNested()
  @Type(() => DateRangeDto)
  dateRange: DateRangeDto;
}

export class PredictAttendanceImpactDto {
  @ApiProperty({ example: '2026-11-01T10:00:00Z' })
  @IsDateString()
  newStartDate: string;

  @ApiProperty({ example: '2026-11-01T18:00:00Z' })
  @IsDateString()
  newEndDate: string;
}

// ─── Conflict detection DTOs ──────────────────────────────────────────────────

/**
 * Minimum payload needed to check whether a venue is free for a time slot.
 * Used directly by `detect_schedule_conflict` and extended by the suggest / resolve DTOs.
 */
export class DetectScheduleConflictDto {
  @ApiProperty({
    description:
      'Venue name / location string exactly as stored on Event.location. ' +
      'Matching is case-insensitive and whitespace-trimmed.',
    example: 'Moscone Center',
  })
  @IsString()
  @IsNotEmpty()
  venue: string;

  @ApiProperty({
    description: 'Proposed start of the slot (ISO 8601).',
    example: '2026-11-15T09:00:00Z',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'Proposed end of the slot (ISO 8601). Must be after startDate.',
    example: '2026-11-15T18:00:00Z',
  })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    description:
      'UUID of the event being rescheduled. Pass this so the event does not ' +
      'conflict with its own current booking.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  excludeEventId?: string;
}

/**
 * Request body for `suggest_alternative_slots`.
 * Extends the conflict check DTO with search-window tuning parameters.
 */
export class SuggestAlternativeSlotsDto extends DetectScheduleConflictDto {
  @ApiPropertyOptional({
    description: 'Maximum number of alternative slots to return. Defaults to 3.',
    default: 3,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Step size in hours between probed candidate slots. ' +
      'Smaller values produce denser suggestions; defaults to 24 (one day).',
    default: 24,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  stepHours?: number;

  @ApiPropertyOptional({
    description:
      'How many days either side of the requested slot to search for free windows. ' +
      'Defaults to 14.',
    default: 14,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  searchWindowDays?: number;
}

/**
 * Request body for `resolve_conflict`.
 * Same parameters as suggest — detects and resolves in one call.
 */
export class ResolveConflictDto extends SuggestAlternativeSlotsDto {}

/**
 * Used by `EventsService` to run a conflict check on behalf of an event
 * being created or updated. `excludeEventId` is always set automatically
 * so the event does not clash with its own existing booking when rescheduled.
 */
export class CheckSlotOnCreateDto {
  @ApiProperty({ description: 'Venue / location string', example: 'Moscone Center' })
  @IsString()
  @IsNotEmpty()
  venue: string;

  @ApiProperty({ example: '2026-11-15T09:00:00Z' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-11-15T18:00:00Z' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    description:
      'When true a conflict blocks the create/update with HTTP 409. ' +
      'When false (default) the response includes a `conflictWarning` field instead.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  strict?: boolean;
}
