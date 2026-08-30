import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { EventCategory } from '../../events/entities/event.entity';

export class AnalyzeOptimalTimingDto {
  @ApiProperty({ enum: EventCategory })
  @IsEnum(EventCategory)
  category: EventCategory;

  @ApiProperty()
  @IsString()
  location: string;

  @ApiProperty({ description: 'Event duration in hours' })
  @IsNumber()
  duration: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  targetAudience?: string;
}

export class DateRangeDto {
  @ApiProperty()
  @IsDateString()
  start: string;

  @ApiProperty()
  @IsDateString()
  end: string;
}

export class SuggestEventScheduleDto {
  @ApiProperty({ enum: EventCategory })
  @IsEnum(EventCategory)
  category: EventCategory;

  @ApiProperty()
  @IsString()
  location: string;

  @ApiProperty({ description: 'Event duration in hours' })
  @IsNumber()
  duration: number;

  @ApiProperty({ type: DateRangeDto })
  @ValidateNested()
  @Type(() => DateRangeDto)
  dateRange: DateRangeDto;
}

export class PredictAttendanceImpactDto {
  @ApiProperty()
  @IsDateString()
  newStartDate: string;

  @ApiProperty()
  @IsDateString()
  newEndDate: string;
}

export class DetectScheduleConflictDto {
  @ApiProperty({ description: 'Venue the slot is being requested at' })
  @IsString()
  venue: string;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiProperty({
    required: false,
    description:
      'Event to ignore when checking — pass the event being rescheduled so it does not conflict with itself',
  })
  @IsOptional()
  @IsUUID()
  excludeEventId?: string;
}

export class SuggestAlternativeSlotsDto extends DetectScheduleConflictDto {
  @ApiProperty({ required: false, default: 3 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiProperty({
    required: false,
    default: 24,
    description: 'Increment, in hours, between probed slots',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  stepHours?: number;

  @ApiProperty({
    required: false,
    default: 14,
    description: 'How far either side of the requested slot to search',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  searchWindowDays?: number;
}

export class ResolveConflictDto extends SuggestAlternativeSlotsDto {}
