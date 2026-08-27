import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum AchievementCategory {
  BOOKING    = 'booking',    // ticket purchases
  SOCIAL     = 'social',     // sharing, referrals
  REVIEW     = 'review',     // writing reviews
  LOYALTY    = 'loyalty',    // streak / repeat attendance
  ORGANIZER  = 'organizer',  // hosting events
  EXPLORER   = 'explorer',   // attending diverse categories
  MILESTONE  = 'milestone',  // XP / points milestones
}

export enum AchievementTier {
  BRONZE   = 'bronze',
  SILVER   = 'silver',
  GOLD     = 'gold',
  PLATINUM = 'platinum',
}

/**
 * Defines an achievement badge that can be awarded to users.
 * Seeded at startup; admins can also create custom achievements.
 */
@Index(['category', 'tier'])
@Entity('achievements')
export class Achievement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Unique machine-readable key, e.g. "early_bird_bronze" */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'text' })
  description: string;

  /** Emoji or icon identifier shown in the UI */
  @Column({ type: 'varchar', length: 16, default: '🏅' })
  icon: string;

  @Column({ type: 'enum', enum: AchievementCategory })
  category: AchievementCategory;

  @Column({ type: 'enum', enum: AchievementTier, default: AchievementTier.BRONZE })
  tier: AchievementTier;

  /** XP points awarded when this achievement is unlocked */
  @Column({ type: 'int', default: 10 })
  xpReward: number;

  /**
   * Threshold value for automatic award_achievement checks.
   * Meaning depends on category:
   *  booking   → number of tickets purchased
   *  review    → number of verified reviews written
   *  loyalty   → consecutive events attended
   *  organizer → number of events hosted
   *  explorer  → number of distinct event categories attended
   *  social    → number of shares / referrals
   *  milestone → total XP accumulated
   */
  @Column({ type: 'int', default: 1 })
  threshold: number;

  /** Whether this achievement can be awarded multiple times */
  @Column({ type: 'boolean', default: false })
  repeatable: boolean;

  /** Whether this achievement is active and can be awarded */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
