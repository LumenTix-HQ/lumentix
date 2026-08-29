import {
  IsEnum,
  IsOptional,
  IsString,
  IsNumber,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClaimStatus } from '../enums/claim-status.enum';

/** Only APPROVED and REJECTED are valid review decisions. */
const ReviewDecision = {
  APPROVED: ClaimStatus.APPROVED,
  REJECTED: ClaimStatus.REJECTED,
} as const;

type ReviewDecisionType = (typeof ReviewDecision)[keyof typeof ReviewDecision];

export class ReviewClaimDto {
  @ApiProperty({ enum: [ClaimStatus.APPROVED, ClaimStatus.REJECTED] })
  @IsEnum(ReviewDecision)
  decision: ReviewDecisionType;

  @ApiPropertyOptional({
    example: 230.0,
    description: 'Approved payout amount — required when decision is APPROVED',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  approvedAmount?: number;

  @ApiPropertyOptional({ example: 'Claim verified against event cancellation notice.' })
  @IsOptional()
  @IsString()
  reviewNotes?: string;
}
