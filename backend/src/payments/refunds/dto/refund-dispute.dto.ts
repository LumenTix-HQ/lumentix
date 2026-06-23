import { RefundDisputeStatus } from '../enums';

/**
 * DTO for refund dispute response
 */
export class RefundDisputeDto {
  /** Unique dispute ID */
  id: string;

  /** Payment ID being disputed */
  paymentId: string;

  /** User who filed the dispute */
  userId: string;

  /** Reason for dispute */
  reason: string;

  /** Detailed description */
  description: string;

  /** Current status of the dispute */
  status: RefundDisputeStatus;

  /** Amount requested in dispute resolution */
  requestedAmount: number;

  /** Amount approved for refund */
  approvedAmount?: number;

  /** Currency */
  currency: string;

  /** Resolution notes from reviewer */
  resolutionNotes?: string;

  /** When the dispute was filed */
  createdAt: Date;

  /** When the dispute was last updated */
  updatedAt: Date;

  /** When the dispute was resolved */
  resolvedAt?: Date;

  /** Admin/reviewer who handled the dispute */
  reviewedBy?: string;
}
