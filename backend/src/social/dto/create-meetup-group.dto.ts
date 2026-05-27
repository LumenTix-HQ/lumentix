import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMeetupGroupDto {
  @ApiProperty({ description: 'Event this meetup group belongs to', format: 'uuid' })
  @IsUUID()
  eventId: string;

  @ApiProperty({ example: 'AI & ML Enthusiasts', maxLength: 150 })
  @IsString()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ example: 'Let\'s discuss the latest in AI during the lunch break' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Main lobby, near the coffee stand' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  meetingPoint?: string;

  @ApiPropertyOptional({ example: '2025-06-15T12:30:00Z' })
  @IsOptional()
  @IsDateString()
  meetingTime?: string;

  @ApiPropertyOptional({ example: 20, description: 'Max members (omit for unlimited)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  maxMembers?: number;

  @ApiPropertyOptional({ example: ['AI', 'Machine Learning', 'LLMs'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  topics?: string[];
}
