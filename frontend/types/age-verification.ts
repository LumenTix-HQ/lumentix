export enum AgeRestriction {
  NONE = 'none',
  EIGHTEEN_PLUS = '18+',
  TWENTY_ONE_PLUS = '21+',
}

export enum VerificationMethod {
  MANUAL = 'manual',
  IDENTITY_SERVICE = 'identity_service',
  BLOCKCHAIN = 'blockchain',
  THIRD_PARTY = 'third_party',
}

export type VerificationStatus = 'pending' | 'verified' | 'failed' | 'expired';

export interface VerifyAgeDto {
  eventId: string;
  dateOfBirth?: string;
  verificationMethod?: VerificationMethod;
  identityVerificationId?: string;
}

export interface SetAgeRestrictionDto {
  ageRestriction: AgeRestriction;
}

export interface AgeVerificationResponse {
  isCompliant: boolean;
  requiredRestriction: AgeRestriction;
  verificationStatus?: VerificationStatus;
  verificationMethod?: VerificationMethod;
  verifiedAt?: string;
  message?: string;
}
