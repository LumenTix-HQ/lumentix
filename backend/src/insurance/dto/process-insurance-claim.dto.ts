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
