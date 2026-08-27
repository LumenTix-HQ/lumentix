/**
 * Status of refund disputes/chargebacks
 */
export enum RefundDisputeStatus {
  /** User has raised a dispute */
  OPEN = 'open',

  /** Under investigation */
  UNDER_REVIEW = 'under_review',

  /** Resolved in favor of user - full or partial refund approved */
  APPROVED = 'approved',

  /** Resolved - user's dispute claim was rejected */
  REJECTED = 'rejected',

  /** Refund issued as result of dispute */
  RESOLVED = 'resolved',

  /** Dispute was cancelled by user */
  CANCELLED = 'cancelled',
}
