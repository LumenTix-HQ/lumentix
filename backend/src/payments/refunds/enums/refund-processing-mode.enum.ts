/**
 * Processing mode for refund timing
 */
export enum RefundProcessingMode {
  /** Immediate processing and payout */
  IMMEDIATE = 'immediate',

  /** Delayed processing (e.g., 24-48 hours for compliance/fraud checks) */
  DELAYED = 'delayed',

  /** Manual review required before processing */
  MANUAL_REVIEW = 'manual_review',

  /** Automatic retry after failed attempt */
  RETRY = 'retry',
}
