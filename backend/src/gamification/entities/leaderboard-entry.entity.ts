import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum LeaderboardPeriod {
  ALL_TIME = 'ALL_TIME',
  MONTHLY = 'MONTHLY',
  WEEKLY = 'WEEKLY',
}

@Entity('gamification_leaderboard')
@Index(['period', 'xp'])
@Index(['userId', 'period'], { unique: true })
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum LeaderboardPeriod {
  ALL_TIME = 'all_time',
  MONTHLY  = 'monthly',
  WEEKLY   = 'weekly',
}

/**
 * Snapshot of the leaderboard at a point in time.
 * update_leaderboard writes a new batch of entries each time it runs.
 */
@Index(['period', 'rank'])
@Index(['period', 'userId'])
@Entity('leaderboard_entries')
export class LeaderboardEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Column({ type: 'enum', enum: LeaderboardPeriod, default: LeaderboardPeriod.ALL_TIME })
  period: LeaderboardPeriod;

  @Column({ type: 'int', default: 0 })
  xp: number;

  /** Cached display name / avatar — refreshed when user profile changes */
  @Column({ nullable: true })
  displayName: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
  @Column({ type: 'enum', enum: LeaderboardPeriod })
  period: LeaderboardPeriod;

  /** ISO week/month label for periodic boards, e.g. "2026-W22" or "2026-05" */
  @Column({ type: 'varchar', length: 16, nullable: true })
  periodLabel: string | null;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  userId: string;

  @Column({ type: 'int' })
  rank: number;

  @Column({ type: 'int' })
  xp: number;

  @Column({ type: 'int' })
  level: number;

  @Column({ type: 'int' })
  achievementCount: number;

  /** Display name snapshot (denormalised for fast reads) */
  @Column({ type: 'varchar', nullable: true })
  displayName: string | null;

  @CreateDateColumn()
  snapshotAt: Date;
}
