import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { RewardType } from '../entities/referral.entity';

export class GenerateReferralLinkDto {
  @ApiPropertyOptional({
    description: 'Optional event ID for event-specific ticket referral',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({
    description: 'Reward type for successful referrals (loyalty_points or discount_code)',
    enum: RewardType,
    default: RewardType.LOYALTY_POINTS,
  })
  @IsOptional()
  @IsEnum(RewardType)
  rewardType?: RewardType;

  @ApiPropertyOptional({
    description: 'Optional custom campaign slug or identifier',
    example: 'summer-tickets',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  campaignSlug?: string;
}
