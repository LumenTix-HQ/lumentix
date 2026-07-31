import { IsString, IsOptional, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEmailCampaignDto {
  @ApiPropertyOptional({ example: 'Updated subject line' })
  @IsString()
  @IsOptional()
  subject?: string;

  @ApiPropertyOptional({ example: '<h1>Updated HTML</h1>' })
  @IsString()
  @IsOptional()
  bodyHtml?: string;

  @ApiPropertyOptional({ example: '2026-08-01T09:00:00Z' })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}
