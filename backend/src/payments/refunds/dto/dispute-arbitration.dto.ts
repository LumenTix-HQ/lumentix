import { DisputeClaimType } from '../enums/dispute-claim-type.enum';
import { ArbitrationVerdict } from '../enums/arbitration-verdict.enum';

/**
 * DTO for dispute arbitration response
 */
export class DisputeArbitrationDto {
  id: string;
  paymentId: string;
  claimantId: string;
  respondentId: string;
  eventId: string;
  claimType: DisputeClaimType;
  description: string;
  evidence?: string[];
  status: string;
  arbitratorIds: string[];
  verdict?: ArbitrationVerdict;
  verdictReason?: string;
  awardedAmount?: number;
  currency: string;
  resolvedBy?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
