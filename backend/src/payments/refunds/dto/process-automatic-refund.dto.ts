import { CancellationReason } from '../enums';

/**
 * DTO for triggering automatic refund processing for cancelled events
 */
export class ProcessAutomaticRefundDto {
  /** Event ID being cancelled */
  eventId: string;

  /** Reason for cancellation */
  cancellationReason: CancellationReason;

  /** Additional context about the cancellation (optional) */
  cancellationDetails?: string;

  /** Whether to send notifications to affected users */
  notifyUsers?: boolean;

  /** Batch processing settings for large events */
  batchSize?: number;

  /** Delay between batches (ms) to avoid rate limiting */
  batchDelayMs?: number;

  /** Whether to allow partial refunds or require full only */
  allowPartialRefunds?: boolean;

  /** Metadata to include in audit log */
  metadata?: Record<string, any>;
}
