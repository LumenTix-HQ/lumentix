import { DisputeClaimType } from '../enums/dispute-claim-type.enum';

/**
 * DTO for filing a new dispute claim when an event is falsely described or cancelled
 */
export class FileDisputeClaimDto {
  /** Payment ID being disputed */
  paymentId: string;

  /** Event ID */
  eventId: string;

  /** Respondent (organizer) user ID */
  respondentId: string;

  /** Type of claim */
  claimType: DisputeClaimType;

  /** Detailed description of the claim */
  description: string;

  /** URLs or file IDs of supporting evidence */
  evidence?: string[];
}

