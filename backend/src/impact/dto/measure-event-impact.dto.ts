import { IsOptional, IsObject, IsString, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class EconomicMetricsDto {
  @IsOptional()
  @IsNumber()
  totalRevenue?: number;

  @IsOptional()
  @IsNumber()
  localBusinessImpact?: number;

  @IsOptional()
  @IsNumber()
  jobCreation?: number;

  @IsOptional()
  @IsNumber()
  taxRevenue?: number;
}

class SocialMetricsDto {
  @IsOptional()
  @IsNumber()
  attendeeCount?: number;

  @IsOptional()
  @IsNumber()
  communityEngagement?: number;

  @IsOptional()
  @IsNumber()
  diversityScore?: number;

  @IsOptional()
  @IsNumber()
  accessibilityRating?: number;
}

class EnvironmentalMetricsDto {
  @IsOptional()
  @IsNumber()
  carbonFootprint?: number;

  @IsOptional()
  @IsNumber()
  wasteGenerated?: number;

  @IsOptional()
  @IsNumber()
  energyConsumption?: number;

  @IsOptional()
  @IsNumber()
  sustainabilityScore?: number;
}

export class MeasureEventImpactDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => EconomicMetricsDto)
  economicMetrics?: EconomicMetricsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SocialMetricsDto)
  socialMetrics?: SocialMetricsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EnvironmentalMetricsDto)
  environmentalMetrics?: EnvironmentalMetricsDto;

  @IsOptional()
  @IsObject()
  customMetrics?: Record<string, any>;

  @IsOptional()
  @IsString()
  notes?: string;
}
