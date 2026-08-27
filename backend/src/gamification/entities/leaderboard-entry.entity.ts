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
}
