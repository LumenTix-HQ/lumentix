import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsPositive,
  IsInt,
  Min,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CoverageType } from '../enums/coverage-type.enum';

export class CreateInsuranceProductDto {
  @ApiProperty({ example: 'Event Cancellation Shield' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Covers full ticket refunds if the organiser cancels the event.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: CoverageType, example: CoverageType.CANCELLATION })
  @IsEnum(CoverageType)
  coverageType: CoverageType;

  @ApiProperty({ example: 5.99, description: 'Premium per ticket / policy in USD' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  premiumAmount: number;

  @ApiProperty({ example: 500, description: 'Maximum payout per policy in USD' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  maxCoverageAmount: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    example: { deductible: 0, exclusions: ['force_majeure'], waitingPeriodDays: 0 },
    description: 'Flexible coverage terms object',
  })
  @IsOptional()
  @IsObject()
  coverageTerms?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: 7,
    description: 'Minimum days before the event start that a policy must be purchased (0 = same day ok)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minDaysBeforeEvent?: number;

  @ApiPropertyOptional({
    example: 1000,
    description: 'Maximum number of attendees this product supports (null = unlimited)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxAttendeesSupported?: number;
}
