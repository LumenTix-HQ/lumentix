import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class TrackReferralConversionDto {
  @ApiProperty({
    description: 'Referral code used during checkout',
    example: 'REF-7K9M2P',
  })
  @IsNotEmpty()
  @IsString()
  referralCode: string;

  @ApiProperty({
    description: 'Purchased ticket ID resulting from the referral',
    example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  })
  @IsNotEmpty()
  @IsUUID()
  ticketId: string;

  @ApiPropertyOptional({
    description: 'Event ID for which ticket was purchased',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsOptional()
  @IsUUID()
  eventId?: string;
}
