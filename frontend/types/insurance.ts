export enum InsurancePolicyStatus {
  ACTIVE = 'active',
  CLAIMED = 'claimed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export interface InsurancePolicy {
  id: string;
  ticketId: string;
  eventId: string;
  userId: string;
  premiumPaid: number;
  coverageAmount: number;
  currency: string;
  status: InsurancePolicyStatus;
  claimReason: string | null;
  premiumTransactionHash: string | null;
  claimTransactionHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InsurancePool {
  totalPolicies: number;
  totalClaimsProcessed: number;
  totalPremiumCollected: number;
  totalClaimsPaid: number;
}

export interface InsuranceClaimResult {
  success: boolean;
  policy: InsurancePolicy;
  transactionHash?: string;
}

export enum CancellationReason {
  EVENT_CANCELLED_BY_ORGANIZER = 'EVENT_CANCELLED_BY_ORGANIZER',
  FORCE_MAJEURE = 'FORCE_MAJEURE',
  VENUE_UNAVAILABLE = 'VENUE_UNAVAILABLE',
  ARTIST_PERFORMER_UNAVAILABLE = 'ARTIST_PERFORMER_UNAVAILABLE',
  HEALTH_SAFETY_CONCERNS = 'HEALTH_SAFETY_CONCERNS',
  GOVERNMENT_RESTRICTION = 'GOVERNMENT_RESTRICTION',
  OTHER = 'OTHER',
}

export const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  [CancellationReason.EVENT_CANCELLED_BY_ORGANIZER]: 'Event cancelled by organizer',
  [CancellationReason.FORCE_MAJEURE]: 'Force majeure',
  [CancellationReason.VENUE_UNAVAILABLE]: 'Venue unavailable',
  [CancellationReason.ARTIST_PERFORMER_UNAVAILABLE]: 'Artist / performer unavailable',
  [CancellationReason.HEALTH_SAFETY_CONCERNS]: 'Health & safety concerns',
  [CancellationReason.GOVERNMENT_RESTRICTION]: 'Government restriction',
  [CancellationReason.OTHER]: 'Other',
};
