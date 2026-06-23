import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';

export class ManageContentDeliveryDto {
  @ApiProperty({ example: 'https://cdn.lumentix.example' })
  @IsUrl()
  cdnBaseUrl: string;

  @ApiProperty({ example: 'https://stream.lumentix.example/live/event.m3u8' })
  @IsUrl()
  streamUrl: string;

  @ApiPropertyOptional({ example: 'auto', enum: ['auto', '1080p', '720p', '480p'] })
  @IsOptional()
  @IsString()
  qualityProfile?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  adaptiveBitrate?: boolean;
}

export class OptimizeStreamQualityDto {
  @ApiProperty({ example: 4500, description: 'Target bitrate in kbps' })
  @IsInt()
  @Min(500)
  targetBitrateKbps: number;
}

export class StreamDeliveryResponseDto {
  @ApiProperty()
  eventId: string;

  @ApiProperty()
  cdnBaseUrl: string;

  @ApiProperty()
  streamUrl: string;

  @ApiProperty()
  qualityProfile: string;

  @ApiProperty()
  adaptiveBitrate: boolean;

  @ApiProperty()
  targetBitrateKbps: number;

  @ApiProperty()
  playbackUrl: string;
}

export class StreamPerformanceResponseDto {
  @ApiProperty()
  eventId: string;

  @ApiProperty()
  avgBitrateKbps: number;

  @ApiProperty()
  rebufferRatioPercent: number;

  @ApiProperty()
  concurrentViewers: number;

  @ApiProperty()
  qualityScore: number;

  @ApiProperty()
  healthStatus: 'excellent' | 'good' | 'degraded' | 'poor';

  @ApiProperty()
  lastMeasuredAt: Date;
}
