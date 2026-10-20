import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsBoolean,
} from 'class-validator';

// ─── Enums ───────────────────────────────────────────────────────────────────

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

export enum KycReviewDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

// ─── Request DTOs ─────────────────────────────────────────────────────────────

/**
 * Submitted by the authenticated user to begin the KYC process.
 * Once reviewed by an admin and approved, a verified credential can be issued
 * which the user can reuse across all events without re-submitting documents.
 */
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

/**
 * Admin-only: approve or reject a pending KYC submission.
 * An approved submission unlocks the ability to issue a verified credential.
 */
export class ReviewKycDocumentDto {
  @ApiProperty({
    description: 'Admin decision on the KYC submission',
    enum: KycReviewDecision,
  })
  @IsEnum(KycReviewDecision)
  decision: KycReviewDecision;

  @ApiPropertyOptional({
    description: 'Optional reviewer notes (required when rejecting)',
  })
  @IsOptional()
  @IsString()
  reviewerNotes?: string;
}

/**
 * Admin-only: issue a decentralized identity credential to a user whose KYC
 * has been approved. The credential can then be verified at any event without
 * requiring the user to re-submit documents.
 */
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

  @ApiPropertyOptional({
    description:
      'Decentralized Identifier (DID) string — generated automatically if omitted',
  })
  @IsOptional()
  @IsString()
  did?: string;

  @ApiPropertyOptional({
    description: 'Additional credential metadata as a JSON string',
  })
  @IsOptional()
  @IsString()
  metadata?: string;

  @ApiPropertyOptional({
    description:
      'Optional ISO date string at which the credential expires (e.g. "2027-01-01T00:00:00Z"). ' +
      'Omit for non-expiring credentials.',
  })
  @IsOptional()
  @IsString()
  expiresAt?: string;
}

/**
 * Body used by the credential holder to verify that a specific credential
 * (identified by its UUID) is still valid.
 */
export class VerifyDidCredentialDto {
  @ApiProperty({ description: 'Credential UUID to verify', format: 'uuid' })
  @IsUUID()
  credentialId: string;
}

/**
 * Body used to look up and verify a credential by its DID string
 * (e.g. from a QR code or NFC scan).
 */
export class VerifyByDidStringDto {
  @ApiProperty({
    description: 'Decentralized Identifier string (e.g. did:lumentix:<uuid>)',
    example: 'did:lumentix:550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsNotEmpty()
  did: string;
}

/**
 * Admin-only: revoke a previously issued credential (e.g. after detecting fraud).
 */
export class RevokeCredentialDto {
  @ApiPropertyOptional({ description: 'Reason for revocation' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * Query a specific user's active credential for use during event check-in.
 * Organizer or admin only.
 */
export class CheckEventCredentialDto {
  @ApiProperty({
    description: 'User ID whose credential should be checked',
    format: 'uuid',
  })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({
    description:
      'When true, any valid (non-revoked, non-expired) credential from any provider is accepted. ' +
      'Defaults to false (requires LUMENTIX-issued credential).',
  })
  @IsOptional()
  @IsBoolean()
  acceptAnyProvider?: boolean;
}
