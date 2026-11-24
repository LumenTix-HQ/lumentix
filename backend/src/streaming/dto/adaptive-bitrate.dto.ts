import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class DetectViewerBandwidthDto {
  @ApiProperty({
    example: 3200,
    description: 'Bandwidth measured by the player for the last segment, in kbps',
  })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  measuredBandwidthKbps: number;
}

export class SwitchBitrateTierDto {
  @ApiPropertyOptional({
    example: '720p',
    description:
      'Tier to pin. Omit (or send null) to clear the override and return to automatic selection.',
  })
  @IsOptional()
  @IsString()
  tier?: string | null;
}

export class ReportBufferingEventDto {
  @ApiProperty({
    example: 1800,
    description: 'How long playback stalled, in milliseconds',
  })
  @IsInt()
  @IsPositive()
  @Max(600_000)
  stalledMs: number;
}

export class BitrateTierDto {
  @ApiProperty({ example: '720p' })
  profile: string;

  @ApiProperty({ example: 2475 })
  bitrateKbps: number;
}

export class ViewerStreamStateDto {
  @ApiProperty()
  eventId: string;

  @ApiProperty()
  viewerId: string;

  @ApiProperty({ example: 3200 })
  measuredBandwidthKbps: number;

  @ApiProperty({
    example: 2900,
    description: 'Bandwidth after smoothing; this is what tier decisions use',
  })
  smoothedBandwidthKbps: number;

  @ApiProperty({ example: '720p' })
  currentTier: string;

  @ApiProperty({ example: 2475 })
  currentBitrateKbps: number;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Tier the viewer pinned, or null while on automatic',
  })
  manualTierOverride: string | null;

  @ApiProperty({
    description: 'False while a manual override is pinned',
    example: true,
  })
  adaptiveEnabled: boolean;

  @ApiProperty({ example: 2 })
  bufferingEventCount: number;

  @ApiProperty({ example: 3400 })
  totalBufferingMs: number;

  @ApiProperty({ type: [BitrateTierDto] })
  availableTiers: BitrateTierDto[];

  @ApiProperty({
    example: 'bandwidth',
    description: 'Why the current tier was selected',
  })
  lastSwitchReason: string;

  @ApiProperty({ example: 'https://cdn.lumentix.example/e/1/720p.m3u8' })
  playbackUrl: string;
}
