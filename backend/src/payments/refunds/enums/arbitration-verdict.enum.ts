/**
 * Possible verdicts from dispute arbitration
 */
export enum ArbitrationVerdict {
  /** Claimant (buyer) wins — full refund */
  FAVOR_CLAIMANT = 'favor_claimant',
  /** Respondent (seller/organizer) wins — no refund */
  FAVOR_RESPONDENT = 'favor_respondent',
  /** Partial refund based on arbitrator's judgment */
  PARTIAL = 'partial',
}

