/**
 * Current status of an arbitrator assignment
 */
export enum ArbitratorAssignmentStatus {
  /** Arbitrator is pending acceptance */
  PENDING = 'pending',
  /** Arbitrator accepted the assignment */
  ACCEPTED = 'accepted',
  /** Arbitrator declined the assignment */
  DECLINED = 'declined',
  /** Arbitrator has submitted their verdict */
  VERDICT_SUBMITTED = 'verdict_submitted',
}

