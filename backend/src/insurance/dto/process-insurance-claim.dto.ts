import {
  IsUUID,
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  IsArray,
  IsUrl,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProcessInsuranceClaimDto {
  @ApiProperty({ description: 'Policy ID the claim is raised against' })
  @IsUUID('4')
  policyId: string;

  @ApiProperty({ example: 'Organiser cancelled the event 3 days before the date.' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 250.0, description: 'Amount being claimed (USD)' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  requestedAmount: number;

  @ApiPropertyOptional({
    type: [String],
    example: ['https://storage.example.com/evidence/screenshot.png'],
    description: 'URLs to supporting evidence files (max 10)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  evidenceUrls?: string[];
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, IsEnum } from 'class-validator';

export enum CancellationReason {
  EVENT_CANCELLED_BY_ORGANIZER = 'EVENT_CANCELLED_BY_ORGANIZER',
  FORCE_MAJEURE = 'FORCE_MAJEURE',
  VENUE_UNAVAILABLE = 'VENUE_UNAVAILABLE',
  ARTIST_PERFORMER_UNAVAILABLE = 'ARTIST_PERFORMER_UNAVAILABLE',
  HEALTH_SAFETY_CONCERNS = 'HEALTH_SAFETY_CONCERNS',
  GOVERNMENT_RESTRICTION = 'GOVERNMENT_RESTRICTION',
  OTHER = 'OTHER',
}

export class ProcessInsuranceClaimDto {
  @ApiProperty({
    description: 'UUID of the ticket to process the claim for',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  ticketId: string;

  @ApiProperty({
    description: 'Reason for the cancellation claim',
    enum: CancellationReason,
    example: CancellationReason.EVENT_CANCELLED_BY_ORGANIZER,
  })
  @IsNotEmpty()
  @IsEnum(CancellationReason)
  cancellationReason: CancellationReason;
}
