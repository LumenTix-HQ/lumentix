/**
 * Classification of refund type
 */
export enum RefundType {
  /** Full refund of ticket price */
  FULL = 'full',

  /** Partial refund (percentage-based) */
  PARTIAL = 'partial',

  /** Store credit/voucher for future use */
  STORE_CREDIT = 'store_credit',

  /** No refund, only voucher offered */
  VOUCHER_ONLY = 'voucher_only',
}
