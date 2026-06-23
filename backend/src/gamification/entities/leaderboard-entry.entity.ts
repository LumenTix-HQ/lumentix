import {
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
