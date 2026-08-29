import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { MetricType } from '../entities/telemetry-metric.entity';

export class RecordMetricDto {
  @ApiProperty({ enum: MetricType, description: 'Type of metric to record' })
  @IsEnum(MetricType)
  metricType: MetricType;

  @ApiProperty({ description: 'Service or component name', example: 'auth-service' })
  @IsString()
  service: string;

  @ApiProperty({ description: 'Metric value', example: 125.5 })
  @IsNumber()
  @Min(0)
  value: number;

  @ApiPropertyOptional({ description: 'Unit of measurement', example: 'ms' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ description: 'Optional tags for categorization' })
  @IsOptional()
  tags?: Record<string, string>;
}
