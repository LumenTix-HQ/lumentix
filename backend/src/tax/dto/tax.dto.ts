import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { TaxJurisdictionType } from '../entities/tax.entity';

// ── Register / Update Tax Rule ────────────────────────────────────────────────

export class RegisterTaxRuleDto {
  @ApiProperty({
    example: 'US-CA',
    description: 'ISO 3166 country code or US state abbreviation',
  })
  @IsString()
  @IsNotEmpty()
  jurisdictionCode: string;

  @ApiProperty({ example: 'California' })
  @IsString()
  @IsNotEmpty()
  jurisdictionName: string;

  @ApiProperty({ enum: TaxJurisdictionType, example: TaxJurisdictionType.US_STATE })
  @IsEnum(TaxJurisdictionType)
  jurisdictionType: TaxJurisdictionType;

  @ApiProperty({
    example: 875,
    description: 'Tax rate in basis points (e.g. 875 = 8.75%). Max 10000.',
  })
  @IsInt()
  @Min(0)
  @Max(10000)
  rateBps: number;

  @ApiPropertyOptional({ example: true, description: 'Whether the rule is active' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ── Calculate Tax ─────────────────────────────────────────────────────────────

export class CalculateTaxDto {
  @ApiProperty({ example: 'evt-uuid-here', description: 'Event ID' })
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @ApiProperty({ example: 5000, description: 'Ticket base price (before tax)' })
  @IsInt()
  @Min(1)
  basePrice: number;

  @ApiProperty({ example: 'US-CA', description: 'Jurisdiction code for tax lookup' })
  @IsString()
  @IsNotEmpty()
  jurisdictionCode: string;

  @ApiPropertyOptional({ example: 'USD', description: 'Currency code' })
  @IsString()
  @IsOptional()
  currency?: string;
}

// ── Record Tax Collection ─────────────────────────────────────────────────────

export class RecordTaxCollectionDto {
  @ApiProperty({ example: 'ticket-uuid-here' })
  @IsString()
  @IsNotEmpty()
  ticketId: string;

  @ApiProperty({ example: 'evt-uuid-here' })
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @ApiProperty({ example: 'GABC...XYZ', description: 'Stellar public key of the purchaser' })
  @IsString()
  @IsNotEmpty()
  purchaserAddress: string;

  @ApiProperty({ example: 'US-CA' })
  @IsString()
  @IsNotEmpty()
  jurisdictionCode: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsString()
  @IsOptional()
  currency?: string;
}

// ── Export Tax Report ─────────────────────────────────────────────────────────

export class ExportTaxReportDto {
  @ApiProperty({ example: 'US-CA' })
  @IsString()
  @IsNotEmpty()
  jurisdictionCode: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty({ example: '2026-01-01T00:00:00Z', description: 'Start of the reporting period' })
  @IsISO8601()
  periodStart: string;

  @ApiProperty({ example: '2026-12-31T23:59:59Z', description: 'End of the reporting period' })
  @IsISO8601()
  periodEnd: string;
}
