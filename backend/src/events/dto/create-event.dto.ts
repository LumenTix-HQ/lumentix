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
import { EventStatus } from '../entities/event.entity';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  ticketPrice?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsEnum(EventStatus)
  @IsOptional()
  status?: EventStatus;

  /**
   * Maximum number of tickets that can be sold for this event.
   * Omit or set to null for unlimited capacity.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttendees?: number;
}
