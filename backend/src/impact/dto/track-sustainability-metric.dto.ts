import { IsEnum, IsString, IsNumber, IsOptional, IsObject } from 'class-validator';

export enum MetricType {
  CARBON = 'carbon',
  WASTE = 'waste',
  ENERGY = 'energy',
  WATER = 'water',
  TRANSPORT = 'transport',
  CUSTOM = 'custom',
}

export class TrackSustainabilityMetricDto {
  @IsEnum(MetricType)
  metricType: MetricType;

  @IsString()
  metricName: string;

  @IsNumber()
  value: number;

  @IsString()
  unit: string;

  @IsOptional()
  @IsObject()
  breakdown?: Record<string, number>;

  @IsOptional()
  measuredAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
