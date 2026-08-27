import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class AwardAchievementDto {
  @ApiProperty({ description: 'UUID of the user to award', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ description: 'Achievement key or UUID', example: 'early_bird_bronze' })
  @IsString()
  @IsNotEmpty()
  achievementKeyOrId: string;

  @ApiPropertyOptional({ description: 'Context metadata stored with the award', example: { eventId: 'abc123' } })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
