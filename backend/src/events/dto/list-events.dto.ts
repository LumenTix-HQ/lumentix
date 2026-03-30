import { IsOptional, IsEnum, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { EventStatus } from '../entities/event.entity';
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

  @ApiPropertyOptional({ description: 'Search query for title or description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, description: 'Number of items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;
}
