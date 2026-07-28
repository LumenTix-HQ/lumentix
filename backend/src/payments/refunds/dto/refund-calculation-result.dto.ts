import { RefundType, RefundProcessingMode } from '../enums';

/**
 * Result of refund amount calculation
 */
export class RefundCalculationResultDto {
  /** Amount to be refunded (may be less than original amount) */
  refundAmount: number;

  /** Currency of refund */
  currency: string;

  /** Type of refund (full, partial, store credit, etc.) */
  refundType: RefundType;

  /** Percentage of original amount being refunded */
  refundPercentage: number;

  /** Any reduction from original amount (e.g., cancellation fee, processing fee) */
  deductionAmount: number;

  /** Reason for any deduction */
  deductionReason?: string;

  /** Suggested processing mode */
  processingMode: RefundProcessingMode;

  /** Earliest time refund can be processed (for delayed refunds) */
  canProcessAfter?: Date;

  /** Store credit amount if applicable */
  storeCredit?: number;

  /** Voucher code if applicable */
  voucherCode?: string;

  /** Human-readable explanation */
  explanation: string;
}
