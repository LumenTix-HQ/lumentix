import {
  IsOptional,
  IsEnum,
  IsString,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ClaimStatus } from '../enums/claim-status.enum';

export class ListClaimsDto {
  @ApiPropertyOptional({ enum: ClaimStatus })
  @IsOptional()
  @IsEnum(ClaimStatus)
  status?: ClaimStatus;

  @ApiPropertyOptional({ description: 'Filter by policy ID' })
  @IsOptional()
  @IsString()
  policyId?: string;

  @ApiPropertyOptional({ description: 'Filter by claimant user ID (admin / insurer use)' })
  @IsOptional()
  @IsString()
  claimantUserId?: string;

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
