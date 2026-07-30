import { IsIn, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TelemetryMetricType, TelemetryNodeStatus } from '../entities/telemetry-metric.entity';

export class RecordMetricDatapointDto {
  @ApiProperty({ description: 'Name of the service or node this datapoint belongs to', example: 'api-gateway' })
  @IsString()
  @IsNotEmpty()
  service!: string;

  @ApiPropertyOptional({ description: 'Type of metric being recorded', enum: ['ping_latency', 'custom'], default: 'custom' })
  @IsOptional()
  @IsIn(['ping_latency', 'custom'])
  metricType?: TelemetryMetricType;

  @ApiProperty({ description: 'Numeric value of the datapoint', example: 128.4 })
  @IsNumber()
  value!: number;

  @ApiPropertyOptional({ description: 'Unit of measurement', example: 'ms', default: 'ms' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ description: 'Node status associated with this datapoint', enum: ['up', 'down', 'degraded'] })
  @IsOptional()
  @IsIn(['up', 'down', 'degraded'])
  status?: TelemetryNodeStatus;

  @ApiPropertyOptional({ description: 'Arbitrary metadata to attach to the datapoint' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
