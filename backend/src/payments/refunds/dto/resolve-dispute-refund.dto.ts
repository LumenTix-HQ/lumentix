import { ArbitrationVerdict } from '../enums/arbitration-verdict.enum';

/**
 * DTO for resolving a dispute with a refund decision
 */
export class ResolveDisputeRefundDto {
  /** The verdict from the arbitrator(s) */
  verdict: ArbitrationVerdict;

  /** Reasoning for the verdict */
  verdictReason: string;

  /** Amount to award (for partial refunds) */
  awardedAmount?: number;
}

