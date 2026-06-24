import { IsOptional, IsEnum, IsArray, IsString } from 'class-validator';

export enum ReportFormat {
  PDF = 'pdf',
  JSON = 'json',
  CSV = 'csv',
}

export enum ReportSection {
  ECONOMIC = 'economic',
  SOCIAL = 'social',
  ENVIRONMENTAL = 'environmental',
  CUSTOM = 'custom',
  SUMMARY = 'summary',
}

export class GenerateImpactReportDto {
  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sections?: ReportSection[];

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eventIds?: string[];
}
