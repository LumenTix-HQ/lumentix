import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AwardPointsDto {
  @ApiProperty({ description: 'User ID to award points to', format: 'uuid' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'Points to award', example: 100, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  points: number;

  @ApiPropertyOptional({ description: 'Event ID that triggered the award', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({ description: 'Reason for awarding points', example: 'Attended event: Summer Fest' })
  @IsOptional()
  @IsString()
  description?: string;
}
