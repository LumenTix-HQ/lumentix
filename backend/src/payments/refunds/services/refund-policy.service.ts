import { Injectable, Logger } from '@nestjs/common';
import {
  CancellationReason,
  RefundType,
  RefundProcessingMode,
} from '../enums';
import {
  CalculateRefundAmountDto,
  RefundCalculationResultDto,
} from '../dto';

/**
 * Refund Policy Service
 *
 * Encapsulates business logic for determining refund amounts and processing modes
 * based on event cancellation reasons, timing, and user preferences.
 *
 * This service implements a flexible policy engine that can be easily configured
 * or extended to support different refund scenarios.
 */
@Injectable()
export class RefundPolicyService {
  private readonly logger = new Logger(RefundPolicyService.name);

  /**
   * Policy configurations by cancellation reason.
   * Defines default behavior when events are cancelled for different reasons.
   */
  private readonly policies = {
    [CancellationReason.FORCE_MAJEURE]: {
      refundPercentage: 100,
      processingMode: RefundProcessingMode.IMMEDIATE,
      allowPartial: false,
      deductionPercentage: 0,
      description: 'Full refund - force majeure event',
    },
    [CancellationReason.INSUFFICIENT_ATTENDANCE]: {
      refundPercentage: 100,
      processingMode: RefundProcessingMode.IMMEDIATE,
      allowPartial: false,
      deductionPercentage: 0,
      description: 'Full refund - insufficient attendance',
    },
    [CancellationReason.VENUE_UNAVAILABLE]: {
      refundPercentage: 100,
      processingMode: RefundProcessingMode.IMMEDIATE,
      allowPartial: false,
      deductionPercentage: 0,
      description: 'Full refund - venue unavailable',
    },
    [CancellationReason.KEY_PERFORMER_CANCELLED]: {
      refundPercentage: 100,
      processingMode: RefundProcessingMode.IMMEDIATE,
      allowPartial: false,
      deductionPercentage: 0,
      description: 'Full refund - key performer cancelled',
    },
    [CancellationReason.TECHNICAL_FAILURE]: {
      refundPercentage: 100,
      processingMode: RefundProcessingMode.IMMEDIATE,
      allowPartial: false,
      deductionPercentage: 0,
      description: 'Full refund - technical failure',
    },
    [CancellationReason.ORGANIZER_CANCELLATION]: {
      refundPercentage: 50, // Default to 50% for organizer cancellation
      processingMode: RefundProcessingMode.DELAYED,
      allowPartial: true,
      deductionPercentage: 5, // 5% processing fee
      description: 'Partial refund - organizer cancellation',
    },
    [CancellationReason.ADMIN_CANCELLATION]: {
      refundPercentage: 75, // Partial refund for admin cancellation
      processingMode: RefundProcessingMode.MANUAL_REVIEW,
      allowPartial: true,
      deductionPercentage: 10, // 10% admin fee
      description: 'Partial refund - admin cancellation',
    },
    [CancellationReason.OTHER]: {
      refundPercentage: 50,
      processingMode: RefundProcessingMode.MANUAL_REVIEW,
      allowPartial: true,
      deductionPercentage: 5,
      description: 'Partial refund - unknown reason',
    },
  };

  /**
   * Calculate refund amount based on event cancellation details and user preferences.
   *
   * This implements intelligent refund logic that considers:
   * - Cancellation reason (drives policy selection)
   * - Time proximity to event start (urgency premium for last-minute cancellations)
   * - User preferences (instant refund preferences, etc.)
   * - Event progress (for partial day events)
   *
   * @param dto Calculation parameters
   * @returns Detailed refund calculation result
   */
  calculateRefundAmount(
    dto: CalculateRefundAmountDto,
  ): RefundCalculationResultDto {
    const {
      paymentAmount,
      currency,
      paymentCreatedAt,
      eventStartDate,
      cancellationReason,
      userRefundPreference,
      eventProgressPercentage = 0,
      requestInstantRefund = false,
    } = dto;

    // Get policy for this cancellation reason
    const policy = this.getPolicyForReason(cancellationReason);

    // Calculate base refund percentage
    let refundPercentage = policy.refundPercentage;
    let processingMode = policy.processingMode;
    let deductionPercentage = policy.deductionPercentage;

    // Adjust based on timing proximity to event
    const hoursUntilEvent = this.calculateHoursUntilEvent(eventStartDate);
    const timingAdjustment = this.calculateTimingAdjustment(
      hoursUntilEvent,
      cancellationReason,
    );

    refundPercentage = Math.min(100, refundPercentage + timingAdjustment);

    // Apply user preference for instant refund (may increase fee for immediate processing)
    if (requestInstantRefund && processingMode === RefundProcessingMode.DELAYED) {
      processingMode = RefundProcessingMode.IMMEDIATE;
      deductionPercentage += 2; // 2% fee for accelerated processing
    }

    // Override with explicit user preference if stronger
    if (userRefundPreference === 'full') {
      refundPercentage = 100;
      deductionPercentage = 0;
    } else if (
      userRefundPreference === 'store_credit' &&
      policy.allowPartial
    ) {
      // Store credit might have different deduction
      deductionPercentage = Math.max(0, deductionPercentage - 2);
    }

    // Calculate amounts
    const deductionAmount = (paymentAmount * deductionPercentage) / 100;
    const baseRefundAmount = paymentAmount * (refundPercentage / 100);
    const refundAmount = Math.max(0, baseRefundAmount - deductionAmount);

    // Determine refund type
    const refundType = this.determineRefundType(
      refundPercentage,
      deductionPercentage,
      userRefundPreference,
    );

    // Calculate processing deadline for delayed refunds
    const canProcessAfter =
      processingMode === RefundProcessingMode.DELAYED
        ? new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
        : undefined;

    // Generate voucher code if store credit is offered
    const voucherCode =
      refundType === RefundType.VOUCHER_ONLY || refundType === RefundType.STORE_CREDIT
        ? this.generateVoucherCode(currency)
        : undefined;

    const explanation = this.generateExplanation(
      refundPercentage,
      deductionPercentage,
      cancellationReason,
      hoursUntilEvent,
    );

    return {
      refundAmount,
      currency,
      refundType,
      refundPercentage,
      deductionAmount,
      deductionReason:
        deductionPercentage > 0 ? `Processing fee (${deductionPercentage}%)` : undefined,
      processingMode,
      canProcessAfter,
      storeCredit: refundType === RefundType.STORE_CREDIT ? refundAmount : undefined,
      voucherCode,
      explanation,
    };
  }

  /**
   * Get the refund policy for a specific cancellation reason
   */
  private getPolicyForReason(
    reason: CancellationReason,
  ): (typeof this.policies)[CancellationReason] {
    return this.policies[reason] || this.policies[CancellationReason.OTHER];
  }

  /**
   * Calculate hours until event start
   */
  private calculateHoursUntilEvent(eventStartDate: Date): number {
    const now = new Date();
    const msUntilEvent = eventStartDate.getTime() - now.getTime();
    return msUntilEvent / (1000 * 60 * 60);
  }

  /**
   * Calculate timing adjustment based on how close to event start the cancellation is.
   * Last-minute cancellations typically warrant higher refund percentages.
   */
  private calculateTimingAdjustment(
    hoursUntilEvent: number,
    cancellationReason: CancellationReason,
  ): number {
    // If event already passed, full refund only makes sense for certain reasons
    if (hoursUntilEvent < 0) {
      return 0;
    }

    // Last-minute cancellations (within 24 hours) get additional 10% refund bump
    if (hoursUntilEvent < 24) {
      return 10;
    }

    // Same-week cancellations (within 7 days) get 5% bump
    if (hoursUntilEvent < 168) {
      return 5;
    }

    // For organizer cancellations far in advance, apply lower base (already in policy)
    if (cancellationReason === CancellationReason.ORGANIZER_CANCELLATION) {
      return hoursUntilEvent > 720 ? 15 : 0; // 30 days+ gets +15%
    }

    return 0;
  }

  /**
   * Determine the type of refund based on calculated percentages and preferences
   */
  private determineRefundType(
    refundPercentage: number,
    deductionPercentage: number,
    userPreference?: string,
  ): RefundType {
    if (userPreference === 'store_credit') {
      return RefundType.STORE_CREDIT;
    }

    if (refundPercentage === 100 && deductionPercentage === 0) {
      return RefundType.FULL;
    }

    if (refundPercentage === 0) {
      return RefundType.VOUCHER_ONLY;
    }

    return RefundType.PARTIAL;
  }

  /**
   * Generate a unique voucher code for store credit
   */
  private generateVoucherCode(currency: string): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${currency}-${timestamp}-${random}`;
  }

  /**
   * Generate human-readable explanation of refund calculation
   */
  private generateExplanation(
    refundPercentage: number,
    deductionPercentage: number,
    cancellationReason: CancellationReason,
    hoursUntilEvent: number,
  ): string {
    let explanation = `${refundPercentage}% refund applies for ${cancellationReason}. `;

    if (deductionPercentage > 0) {
      explanation += `${deductionPercentage}% processing fee deducted. `;
    }

    if (hoursUntilEvent < 24) {
      explanation +=
        'Last-minute cancellation bonus applied due to short notice. ';
    }

    return explanation.trim();
  }

  /**
   * Check if a refund is eligible based on time constraints
   */
  isRefundEligible(
    paymentCreatedAt: Date,
    eventStartDate: Date,
    cancellationReason: CancellationReason,
  ): { eligible: boolean; reason?: string } {
    // Some cancellation reasons always qualify (force majeure, venue unavailable, etc.)
    const automaticRefundReasons = [
      CancellationReason.FORCE_MAJEURE,
      CancellationReason.VENUE_UNAVAILABLE,
      CancellationReason.KEY_PERFORMER_CANCELLED,
      CancellationReason.TECHNICAL_FAILURE,
      CancellationReason.INSUFFICIENT_ATTENDANCE,
    ];

    if (automaticRefundReasons.includes(cancellationReason)) {
      return { eligible: true };
    }

    // For other reasons, check time constraints
    const hoursUntilEvent = this.calculateHoursUntilEvent(eventStartDate);
    const REFUND_CUTOFF_HOURS = Number(process.env.REFUND_CUTOFF_HOURS ?? 24);

    if (hoursUntilEvent < REFUND_CUTOFF_HOURS) {
      return {
        eligible: false,
        reason: `Too close to event start (${Math.ceil(hoursUntilEvent)} hours). No refund allowed within ${REFUND_CUTOFF_HOURS} hours of event.`,
      };
    }

    return { eligible: true };
  }
}
