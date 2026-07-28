import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { AchievementCategory } from './achievement.entity';

export enum ChallengeStatus {
  DRAFT     = 'draft',
  ACTIVE    = 'active',
  COMPLETED = 'completed',
  EXPIRED   = 'expired',
}

export enum ChallengeType {
  INDIVIDUAL = 'individual',  // each user completes independently
  COMMUNITY  = 'community',   // all users contribute to a shared goal
}

/**
 * A time-boxed challenge users can participate in to earn bonus XP and badges.
 */
@Index(['status', 'startsAt'])
@Entity('challenges')
export class Challenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 16, default: '🎯' })
  icon: string;

  @Column({ type: 'enum', enum: ChallengeType, default: ChallengeType.INDIVIDUAL })
  type: ChallengeType;

  @Column({ type: 'enum', enum: AchievementCategory })
  category: AchievementCategory;

  @Column({ type: 'enum', enum: ChallengeStatus, default: ChallengeStatus.DRAFT })
  status: ChallengeStatus;

  /**
   * What the user must do to complete the challenge.
   * e.g. { action: 'purchase_ticket', count: 3 }
   *      { action: 'write_review', count: 1 }
   *      { action: 'attend_event', category: 'concert', count: 2 }
   */
  @Column({ type: 'jsonb' })
  criteria: Record<string, unknown>;

  /** Target count for community challenges (total across all participants) */
  @Column({ type: 'int', nullable: true })
  communityGoal: number | null;

  /** Current community progress counter */
  @Column({ type: 'int', default: 0 })
  communityProgress: number;

  /** XP bonus awarded on completion */
  @Column({ type: 'int', default: 50 })
  xpReward: number;

  /** Optional achievement badge unlocked on completion */
  @Column({ type: 'varchar', nullable: true })
  rewardAchievementId: string | null;

  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  endsAt: Date;

  /** Max participants (null = unlimited) */
  @Column({ type: 'int', nullable: true })
  maxParticipants: number | null;

  @Column({ type: 'int', default: 0 })
  participantCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
