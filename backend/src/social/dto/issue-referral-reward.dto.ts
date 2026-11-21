import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { RewardType } from '../entities/referral.entity';

export class IssueReferralRewardDto {
  @ApiProperty({
    description: 'Referral ID to issue reward for',
    example: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
  })
  @IsNotEmpty()
  @IsUUID()
  referralId: string;

  @ApiPropertyOptional({
    description: 'Override reward type if different from original referral setup',
    enum: RewardType,
  })
  @IsOptional()
  @IsEnum(RewardType)
  rewardType?: RewardType;
}
