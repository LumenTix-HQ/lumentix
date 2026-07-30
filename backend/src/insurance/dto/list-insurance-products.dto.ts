import {
  IsOptional,
  IsEnum,
  IsString,
  IsInt,
  Min,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CoverageType } from '../enums/coverage-type.enum';
import { InsuranceProductStatus } from '../enums/insurance-product-status.enum';

export class ListInsuranceProductsDto {
  @ApiPropertyOptional({ enum: CoverageType, description: 'Filter by coverage type' })
  @IsOptional()
  @IsEnum(CoverageType)
  coverageType?: CoverageType;

  @ApiPropertyOptional({ enum: InsuranceProductStatus, description: 'Filter by product status' })
  @IsOptional()
  @IsEnum(InsuranceProductStatus)
  status?: InsuranceProductStatus;

  @ApiPropertyOptional({ description: 'Filter by insurer ID' })
  @IsOptional()
  @IsString()
  insurerId?: string;

  @ApiPropertyOptional({ description: 'Search by product name (case-insensitive)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 0, description: 'Minimum premium amount (USD)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  premiumMin?: number;

  @ApiPropertyOptional({ example: 100, description: 'Maximum premium amount (USD)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  premiumMax?: number;

  @ApiPropertyOptional({ description: 'Filter products compatible with a specific attendee count' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  attendeeCount?: number;

  @ApiPropertyOptional({
    description: 'Return only products purchasable N days before a given event. Pair with eventStartDate.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  daysBeforeEvent?: number;

  @ApiPropertyOptional({ description: 'Sort by: premiumAmount | maxCoverageAmount | totalPoliciesSold | createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC' = 'DESC';

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;
}
