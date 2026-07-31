import {
  IsUUID,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsOptional,
  IsString,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompareInsuranceOptionsDto {
  @ApiProperty({
    type: [String],
    description: 'List of insurance product IDs to compare (2–5)',
    example: ['uuid-1', 'uuid-2', 'uuid-3'],
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(5)
  @IsUUID('4', { each: true })
  productIds: string[];

  /**
   * Optional — provide the event ID to enrich comparison with
   * eligibility checks (e.g. minDaysBeforeEvent, maxAttendeesSupported).
   */
  @ApiPropertyOptional({ description: 'Event ID for eligibility context' })
  @IsOptional()
  @IsUUID('4')
  eventId?: string;

  /** Number of attendees for eligibility filtering. */
  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  attendeeCount?: number;
}
