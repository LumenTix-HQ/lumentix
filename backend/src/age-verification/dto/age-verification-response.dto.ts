import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgeRestriction, VerificationMethod, VerificationStatus } from '../entities/age-verification.entity';

export class AgeVerificationResponseDto {
  @ApiProperty({ description: 'Whether the user meets the age requirement' })
  isCompliant: boolean;

  @ApiProperty({ enum: AgeRestriction, description: 'Required age restriction' })
  requiredRestriction: AgeRestriction;

  @ApiPropertyOptional({ enum: ['pending', 'verified', 'failed', 'expired'], description: 'Current verification status' })
  verificationStatus?: VerificationStatus;

  @ApiPropertyOptional({ enum: VerificationMethod, description: 'Method used for verification' })
  verificationMethod?: VerificationMethod;

  @ApiPropertyOptional({ description: 'ISO date of when verification was completed' })
  verifiedAt?: string;

  @ApiPropertyOptional({ description: 'Message providing additional context' })
  message?: string;
}
