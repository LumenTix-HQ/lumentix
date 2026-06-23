/**
 * DTO for filing a refund dispute/chargeback
 */
export class CreateRefundDisputeDto {
  /** Payment ID being disputed */
  paymentId: string;

  /** Reason for the dispute */
  reason: string;

  /** Description/details of the dispute */
  description: string;

  /** Whether user received any benefit from the event despite cancellation */
  receivedPartialBenefit?: boolean;

  /** If partial benefit received, what percentage (0-100) */
  benefitPercentage?: number;

  /** Supporting evidence/documents (URLs or file IDs) */
  supportingDocuments?: string[];

  /** Preferred resolution method */
  preferredResolution?: 'full_refund' | 'partial_refund' | 'store_credit';
}
