import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VerificationMethod } from '../entities/age-verification.entity';

export class VerifyAgeDto {
  @ApiProperty({ description: 'The UUID of the event' })
  @IsUUID()
  @IsNotEmpty()
  eventId: string;

  @ApiPropertyOptional({ description: 'Date of birth (ISO 8601 date)', example: '1995-06-15' })
  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({
    enum: VerificationMethod,
    description: 'Method used for verification',
  })
  @IsEnum(VerificationMethod)
  @IsOptional()
  verificationMethod?: VerificationMethod;

  @ApiPropertyOptional({ description: 'External identity verification reference ID' })
  @IsString()
  @IsOptional()
  identityVerificationId?: string;
}
