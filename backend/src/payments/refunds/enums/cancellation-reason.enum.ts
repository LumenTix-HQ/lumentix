/**
 * Reasons for event cancellation - drives refund policy determination
 */
export enum CancellationReason {
  /**
   * Organizer explicitly cancelled due to lack of demand
   * Refund: Usually partial or deferred
   */
  ORGANIZER_CANCELLATION = 'organizer_cancellation',

  /**
   * Insufficient minimum attendance threshold reached
   * Refund: Full refund, opportunity to reschedule
   */
  INSUFFICIENT_ATTENDANCE = 'insufficient_attendance',

  /**
   * External circumstances (weather, pandemic, natural disaster, etc.)
   * Refund: Full refund, may offer voucher for future events
   */
  FORCE_MAJEURE = 'force_majeure',

  /**
   * Venue/location became unavailable
   * Refund: Full refund with option to reschedule
   */
  VENUE_UNAVAILABLE = 'venue_unavailable',

  /**
   * Speaker or key performer cancelled
   * Refund: Full refund or partial with rescheduled alternative
   */
  KEY_PERFORMER_CANCELLED = 'key_performer_cancelled',

  /**
   * Technical/operational issues prevent event execution
   * Refund: Full refund immediately
   */
  TECHNICAL_FAILURE = 'technical_failure',

  /**
   * Admin/platform enforced cancellation (policy violation, fraud, etc.)
   * Refund: May be partial or denied depending on violation
   */
  ADMIN_CANCELLATION = 'admin_cancellation',

  /**
   * Unknown or unspecified reason
   * Refund: Default policy applied
   */
  OTHER = 'other',
}
