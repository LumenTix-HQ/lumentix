import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AchievementCategory } from '../entities/achievement.entity';
import { ChallengeType } from '../entities/challenge.entity';

export class CreateChallengeDto {
  @ApiProperty({ example: 'Weekend Warrior' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  title: string;

  @ApiProperty({ example: 'Attend 3 events this weekend to earn bonus XP.' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ example: '⚔️' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  icon?: string;

  @ApiProperty({ enum: ChallengeType })
  @IsEnum(ChallengeType)
  type: ChallengeType;

  @ApiProperty({ enum: AchievementCategory })
  @IsEnum(AchievementCategory)
  category: AchievementCategory;

  @ApiProperty({
    description: 'Completion criteria object',
    example: { action: 'attend_event', count: 3 },
  })
  @IsObject()
  criteria: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Community goal (for community challenges)', example: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  communityGoal?: number;

  @ApiPropertyOptional({ description: 'XP bonus on completion', example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  xpReward?: number;

  @ApiPropertyOptional({ description: 'Achievement UUID to unlock on completion' })
  @IsOptional()
  @IsUUID()
  rewardAchievementId?: string;

  @ApiProperty({ description: 'ISO 8601 start datetime', example: '2026-06-01T00:00:00Z' })
  @IsDateString()
  startsAt: string;

  @ApiProperty({ description: 'ISO 8601 end datetime', example: '2026-06-07T23:59:59Z' })
  @IsDateString()
  endsAt: string;

  @ApiPropertyOptional({ description: 'Max participants (null = unlimited)', example: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxParticipants?: number;
}
