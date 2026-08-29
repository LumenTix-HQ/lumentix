import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RecordScanDto {
  @ApiProperty({ description: 'Event ID', format: 'uuid' })
  @IsUUID()
  eventId: string;

  @ApiPropertyOptional({ description: 'Gate/entrance ID' })
  @IsOptional()
  @IsString()
  gateId?: string;

  @ApiProperty({ description: 'Time to complete scan in milliseconds', minimum: 0 })
  @IsNumber()
  @Min(0)
  scanTimeMs: number;

  @ApiPropertyOptional({ description: 'Whether scan was successful' })
  @IsOptional()
  success?: boolean;
}

export class FetchRealtimeScanSpeedDto {
  @ApiProperty({ description: 'Event ID', format: 'uuid' })
  @IsUUID()
  eventId: string;

  @ApiPropertyOptional({ description: 'Gate ID to filter by' })
  @IsOptional()
  @IsString()
  gateId?: string;

  @ApiPropertyOptional({ description: 'Minutes of historical data to fetch', minimum: 1, maximum: 60 })
  @IsOptional()
  @IsNumber()
  minutesBack?: number;
}
