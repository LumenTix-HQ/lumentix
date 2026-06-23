import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { AchievementCategory } from '../entities/achievement.entity';

/**
 * Describes a user activity that should trigger achievement checks and XP awards.
 * Called internally by other services (tickets, reviews, payments, etc.).
 */
export enum ActivityType {
  TICKET_PURCHASED   = 'ticket_purchased',
  EVENT_ATTENDED     = 'event_attended',    // ticket scanned / used
  REVIEW_WRITTEN     = 'review_written',
  EARLY_BOOKING      = 'early_booking',     // purchased > 30 days before event
  SOCIAL_SHARE       = 'social_share',
  EVENT_HOSTED       = 'event_hosted',
  INSURANCE_BOUGHT   = 'insurance_bought',
  REFERRAL_MADE      = 'referral_made',
  FIRST_TICKET       = 'first_ticket',
  FIVE_STAR_REVIEW   = 'five_star_review',
}

export class RecordActivityDto {
  @ApiProperty({ enum: ActivityType })
  @IsEnum(ActivityType)
  activityType: ActivityType;

  @ApiPropertyOptional({ description: 'Event category for explorer achievements', example: 'concert' })
  @IsOptional()
  @IsString()
  eventCategory?: string;

  @ApiPropertyOptional({ description: 'Additional context stored with the activity' })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
