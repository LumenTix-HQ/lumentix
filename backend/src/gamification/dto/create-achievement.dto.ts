import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AchievementCategory, AchievementTier } from '../entities/achievement.entity';

export class CreateAchievementDto {
  @ApiProperty({ description: 'Unique machine-readable key', example: 'early_bird_gold' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9_]+$/, { message: 'key must be lowercase alphanumeric with underscores' })
  @MaxLength(64)
  key: string;

  @ApiProperty({ example: 'Early Bird Gold' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name: string;

  @ApiProperty({ example: 'Purchase tickets more than 30 days before 10 events.' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ example: '🥇' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  icon?: string;

  @ApiProperty({ enum: AchievementCategory })
  @IsEnum(AchievementCategory)
  category: AchievementCategory;

  @ApiProperty({ enum: AchievementTier })
  @IsEnum(AchievementTier)
  tier: AchievementTier;

  @ApiPropertyOptional({ description: 'XP reward on unlock', example: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  xpReward?: number;

  @ApiPropertyOptional({ description: 'Threshold count to trigger auto-award', example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  threshold?: number;

  @ApiPropertyOptional({ description: 'Can be awarded multiple times', example: false })
  @IsOptional()
  @IsBoolean()
  repeatable?: boolean;
}
