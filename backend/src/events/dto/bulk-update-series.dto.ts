import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { EventStatus } from '../entities/event.entity';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class BulkUpdateSeriesDto {
  @ApiPropertyOptional({
    description: 'Specific event UUIDs to update. If omitted/empty, updates all events in the series.',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  eventIds?: string[];

  @ApiPropertyOptional({ enum: EventStatus, description: 'Bulk status update' })
  @IsEnum(EventStatus)
  @IsOptional()
  status?: EventStatus;

  @ApiPropertyOptional({ example: 15.0, description: 'Bulk ticket price update' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  ticketPrice?: number;
}
