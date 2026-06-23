import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, Max, IsBoolean } from 'class-validator';

export class UpdateCapacityLimitsDto {
  @ApiProperty({
    description: 'New hard capacity limit (max attendees). Set to 0 to remove the limit.',
    example: 500,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  maxAttendees: number;

  @ApiPropertyOptional({
    description: 'Warning threshold as a percentage of capacity (default 70)',
    example: 70,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  warningThresholdPercent?: number;

  @ApiPropertyOptional({
    description: 'Critical threshold as a percentage of capacity (default 85)',
    example: 85,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  criticalThresholdPercent?: number;

  @ApiPropertyOptional({
    description: 'Reason for the capacity change (stored in audit log)',
    example: 'Fire marshal reduced limit due to blocked exit',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'If true, pause new ticket sales immediately when limit is reached',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  pauseSalesAtLimit?: boolean;
}
