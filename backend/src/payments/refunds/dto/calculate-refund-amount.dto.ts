import { CancellationReason, RefundType, RefundProcessingMode } from '../enums';

/**
 * DTO for calculating refund amount based on various factors
 */
export class CalculateRefundAmountDto {
  /** Original payment amount */
  paymentAmount: number;

  /** Currency of payment */
  currency: string;

  /** When payment was created */
  paymentCreatedAt: Date;

  /** When event was scheduled to start */
  eventStartDate: Date;

  /** Reason for event cancellation */
  cancellationReason: CancellationReason;

  /** User's refund preference (if any override) */
  userRefundPreference?: 'full' | 'partial' | 'store_credit';

  /** Time percentage of event that passed (0-100, for partial refund scenarios) */
  eventProgressPercentage?: number;

  /** Whether user has requested instant refund (impacts fees) */
  requestInstantRefund?: boolean;
}
