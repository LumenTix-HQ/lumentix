export enum ReviewStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  FLAGGED = 'flagged',
}

export interface EventReview {
  id: string;
  eventId: string;
  reviewerId: string;
  organizerId: string;
  ticketId: string;
  rating: number;
  comment: string | null;
  attendanceVerified: boolean;
  status: ReviewStatus;
  blockchainTxHash: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReputationScore {
  organizerId: string;
  reputationScore: number;
  averageRating: number;
  totalReviews: number;
  ratingDistribution: Record<string, number>;
  ratingStdDev: number;
  lastCalculatedAt: string;
}

export interface AttendanceVerificationResult {
  verified: boolean;
  review: EventReview;
  reason?: string;
}

export interface PaginatedReviews {
  data: EventReview[];
  total: number;
  page: number;
  lastPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
