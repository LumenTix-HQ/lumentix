import { RefundResultDto } from './refund-result.dto';

/**
 * Summary result of automatic refund processing for an event
 */
export class AutomaticRefundResultDto {
  /** Event ID that was processed */
  eventId: string;

  /** Total number of refunds processed */
  totalRefunds: number;

  /** Number of successful refunds */
  successfulRefunds: number;

  /** Number of failed refunds */
  failedRefunds: number;

  /** Number of skipped refunds (ineligible) */
  skippedRefunds: number;

  /** Total amount refunded */
  totalRefundedAmount: number;

  /** Currency */
  currency: string;

  /** Detailed results for each refund */
  refundResults: RefundResultDto[];

  /** When processing started */
  processedAt: Date;

  /** Execution time in milliseconds */
  executionTimeMs: number;

  /** Any errors that occurred during bulk processing */
  errors?: string[];

  /** Summary statistics by status */
  summary: {
    totalPaymentAmount: number;
    averageRefundAmount: number;
    successRate: number;
  };
}
