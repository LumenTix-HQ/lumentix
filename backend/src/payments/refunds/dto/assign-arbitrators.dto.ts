/**
 * DTO for assigning arbitrators to a dispute
 */
export class AssignArbitratorsDto {
  /** Dispute arbitration ID */
  disputeId: string;

  /** Arbitrator user IDs to assign */
  arbitratorIds: string[];
}

