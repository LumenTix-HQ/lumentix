import { IsEnum, IsString, IsNumber, IsOptional, IsDateString, ValidateNested } from 'class-validator';
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
