import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsUrl,
} from 'class-validator';

export enum DocumentType {
  PASSPORT = 'PASSPORT',
  NATIONAL_ID = 'NATIONAL_ID',
  DRIVERS_LICENSE = 'DRIVERS_LICENSE',
  RESIDENCE_PERMIT = 'RESIDENCE_PERMIT',
}

export enum CredentialProvider {
  LUMENTIX = 'LUMENTIX',
  THIRD_PARTY = 'THIRD_PARTY',
}

export class SubmitKycDocumentsDto {
  @ApiProperty({ description: 'Type of identity document', enum: DocumentType })
  @IsEnum(DocumentType)
  documentType: DocumentType;

  @ApiProperty({ description: 'Document number (e.g. passport number)' })
  @IsString()
  @IsNotEmpty()
  documentNumber: string;

  @ApiPropertyOptional({
    description: 'URL or reference to the uploaded document file',
  })
  @IsOptional()
  @IsString()
  documentUrl?: string;

  @ApiPropertyOptional({ description: 'Full name as it appears on the document' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({
    description: 'ISO date string of date of birth (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Country code (ISO 3166-1 alpha-2)' })
  @IsOptional()
  @IsString()
  countryCode?: string;
}

export class IssueVerifiedCredentialDto {
  @ApiProperty({ description: 'User ID to issue credential to', format: 'uuid' })
  @IsUUID()
  subjectUserId: string;

  @ApiProperty({
    description: 'Identity provider that verified the credential',
    enum: CredentialProvider,
  })
  @IsEnum(CredentialProvider)
  provider: CredentialProvider;

  @ApiPropertyOptional({ description: 'Optional DID (Decentralized Identifier) string' })
  @IsOptional()
  @IsString()
  did?: string;

  @ApiPropertyOptional({ description: 'Additional credential metadata (JSON string)' })
  @IsOptional()
  @IsString()
  metadata?: string;
}

export class VerifyDidCredentialDto {
  @ApiProperty({ description: 'Credential ID to verify', format: 'uuid' })
  @IsUUID()
  credentialId: string;
}
