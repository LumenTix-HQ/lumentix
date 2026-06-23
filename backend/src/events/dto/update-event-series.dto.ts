import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { EventCategory, EventAgeRestriction } from '../entities/event.entity';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEventSeriesDto {
  @ApiPropertyOptional({ example: 'Updated Series Title' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'New location' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ example: 12.5 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  ticketPrice?: number;

  @ApiPropertyOptional({ example: 'XLM' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: 150 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttendees?: number;

  @ApiPropertyOptional({ enum: EventCategory })
  @IsOptional()
  @IsEnum(EventCategory)
  category?: EventCategory;

  @ApiPropertyOptional({ enum: EventAgeRestriction })
  @IsOptional()
  @IsEnum(EventAgeRestriction)
  ageRestriction?: EventAgeRestriction;

  @ApiPropertyOptional({ example: 50 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  seasonPassPrice?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  discountPercentage?: number;

  @ApiPropertyOptional({ example: 'https://example.com/new-image.png' })
  @IsString()
  @IsOptional()
  imageUrl?: string;
}
