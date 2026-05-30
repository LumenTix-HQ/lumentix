import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RefundPolicy {
  fullRefundWindowHours: number;
  partialRefundRate: number;
  refundCutoffHours: number;
}

export interface RefundCalculationResult {
  eligible: boolean;
  reason?: string;
  refundAmount: number;
}

@Injectable()
export class RefundCalculatorService {
  private readonly policy: RefundPolicy;

  constructor(private readonly configService: ConfigService) {
    this.policy = {
      fullRefundWindowHours: Number(
        this.configService.get<number>('FULL_REFUND_WINDOW_HOURS', 48),
      ),
      partialRefundRate: Number(
        this.configService.get<number>('PARTIAL_REFUND_RATE', 0.5),
      ),
      refundCutoffHours: Number(
        this.configService.get<number>('REFUND_CUTOFF_HOURS', 24),
      ),
    };
  }

  /**
   * Returns the current refund policy values.
   * Useful for observability and admin endpoints.
   */
  getPolicy(): RefundPolicy {
    return { ...this.policy };
  }

  /**
   * Calculate the refund amount based on the time elapsed since purchase
   * and the configured refund policy.
   *
   * Policy (three zones based on hours since purchase):
   *   1. 0 .. fullRefundWindowHours         → 100 % refund.
   *   2. fullRefundWindowHours .. refundCutoffHours  → partial refund.
   *   3. beyond refundCutoffHours          → no refund.
   *
   * NOTE: If fullRefundWindowHours ≥ refundCutoffHours, the partial zone
   * is empty and only zones 1 and 3 apply (i.e. partial refunds are
   * effectively disabled).
   *
   * @param hoursSincePurchase Hours elapsed since the payment was made
   * @param paidAmount         Original payment amount
   */
  calculateRefundAmount(
    hoursSincePurchase: number,
    paidAmount: number,
  ): RefundCalculationResult {
    if (!Number.isFinite(hoursSincePurchase) || hoursSincePurchase < 0) {
      return {
        eligible: false,
        reason: 'Invalid purchase time.',
        refundAmount: 0,
      };
    }

    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      return {
        eligible: false,
        reason: 'Invalid payment amount.',
        refundAmount: 0,
      };
    }

    // Zone 1 — full refund
    if (hoursSincePurchase <= this.policy.fullRefundWindowHours) {
      return { eligible: true, refundAmount: paidAmount };
    }

    // Zone 2 — partial refund (only applies when fullRefundWindowHours < refundCutoffHours)
    if (hoursSincePurchase <= this.policy.refundCutoffHours) {
      const partialAmount = Number(
        (paidAmount * this.policy.partialRefundRate).toFixed(7),
      );
      return { eligible: true, refundAmount: partialAmount };
    }

    // Zone 3 — past final cutoff
    return {
      eligible: false,
      reason: `Refund window closed after ${this.policy.refundCutoffHours} hours from purchase.`,
      refundAmount: 0,
    };
  }

  /**
   * Calculate the refund amount based on how close the event start is.
   * Used for event-level cutoff checks.
   *
   * @param hoursToEvent  Hours until the event starts
   * @param paidAmount    Original payment amount
   */
  calculateRefundByEventProximity(
    hoursToEvent: number,
    paidAmount: number,
  ): RefundCalculationResult {
    if (!Number.isFinite(hoursToEvent)) {
      return { eligible: false, reason: 'Invalid event start time.', refundAmount: 0 };
    }

    if (hoursToEvent < this.policy.refundCutoffHours) {
      return {
        eligible: false,
        reason: 'Too close to event start',
        refundAmount: 0,
      };
    }

    return this.calculateRefundAmount(
      // Treat as if purchased at the boundary — full refund available
      this.policy.fullRefundWindowHours,
      paidAmount,
    );
  }
}
