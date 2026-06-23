export enum AchievementCategory {
  BOOKING   = 'booking',
  SOCIAL    = 'social',
  REVIEW    = 'review',
  LOYALTY   = 'loyalty',
  ORGANIZER = 'organizer',
  EXPLORER  = 'explorer',
  MILESTONE = 'milestone',
}

export enum AchievementTier {
  BRONZE   = 'bronze',
  SILVER   = 'silver',
  GOLD     = 'gold',
  PLATINUM = 'platinum',
}

export enum LeaderboardPeriod {
  ALL_TIME = 'all_time',
  MONTHLY  = 'monthly',
  WEEKLY   = 'weekly',
}

export enum ChallengeStatus {
  DRAFT     = 'draft',
  ACTIVE    = 'active',
  COMPLETED = 'completed',
  EXPIRED   = 'expired',
}

export enum ChallengeType {
  INDIVIDUAL = 'individual',
  COMMUNITY  = 'community',
}

export enum ActivityType {
  TICKET_PURCHASED  = 'ticket_purchased',
  EVENT_ATTENDED    = 'event_attended',
  REVIEW_WRITTEN    = 'review_written',
  EARLY_BOOKING     = 'early_booking',
  SOCIAL_SHARE      = 'social_share',
  EVENT_HOSTED      = 'event_hosted',
  INSURANCE_BOUGHT  = 'insurance_bought',
  REFERRAL_MADE     = 'referral_made',
  FIRST_TICKET      = 'first_ticket',
  FIVE_STAR_REVIEW  = 'five_star_review',
}

export interface Achievement {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  tier: AchievementTier;
  xpReward: number;
  threshold: number;
  repeatable: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface UserAchievement {
  id: string;
  userId: string;
  achievementId: string;
  achievement: Achievement;
  xpAwarded: number;
  context: Record<string, unknown> | null;
  awardedAt: string;
}

export interface GamificationProfile {
  id: string;
  userId: string;
  totalXp: number;
  level: number;
  ticketsPurchased: number;
  reviewsWritten: number;
  eventsAttended: number;
  eventsHosted: number;
  socialShares: number;
  categoriesAttended: string[];
  leaderboardRank: number | null;
  updatedAt: string;
}

export interface LeaderboardEntry {
  id: string;
  period: LeaderboardPeriod;
  periodLabel: string | null;
  userId: string;
  rank: number;
  xp: number;
  level: number;
  achievementCount: number;
  displayName: string | null;
  snapshotAt: string;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  icon: string;
  type: ChallengeType;
  category: AchievementCategory;
  status: ChallengeStatus;
  criteria: Record<string, unknown>;
  communityGoal: number | null;
  communityProgress: number;
  xpReward: number;
  rewardAchievementId: string | null;
  startsAt: string;
  endsAt: string;
  maxParticipants: number | null;
  participantCount: number;
  createdAt: string;
}

export interface ChallengeParticipation {
  id: string;
  challengeId: string;
  userId: string;
  progress: number;
  completed: boolean;
  completedAt: string | null;
  xpAwarded: number | null;
  joinedAt: string;
}

export interface ActivityResult {
  xpGained: number;
  newAchievements: UserAchievement[];
}

export const TIER_STYLES: Record<AchievementTier, { badge: string; glow: string }> = {
  [AchievementTier.BRONZE]:   { badge: 'bg-amber-700/20 text-amber-500 border-amber-700/30',   glow: 'shadow-amber-700/20' },
  [AchievementTier.SILVER]:   { badge: 'bg-gray-400/20 text-gray-300 border-gray-400/30',      glow: 'shadow-gray-400/20' },
  [AchievementTier.GOLD]:     { badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', glow: 'shadow-yellow-500/20' },
  [AchievementTier.PLATINUM]: { badge: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',      glow: 'shadow-cyan-500/20' },
};

export const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  [AchievementCategory.BOOKING]:   'Booking',
  [AchievementCategory.SOCIAL]:    'Social',
  [AchievementCategory.REVIEW]:    'Reviews',
  [AchievementCategory.LOYALTY]:   'Loyalty',
  [AchievementCategory.ORGANIZER]: 'Organizer',
  [AchievementCategory.EXPLORER]:  'Explorer',
  [AchievementCategory.MILESTONE]: 'Milestones',
};
