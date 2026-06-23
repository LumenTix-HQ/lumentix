import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Achievement } from './achievement.entity';

/**
 * Records that a specific user has been awarded a specific achievement.
 * For non-repeatable achievements, the (userId, achievementId) pair is unique.
 */
@Index(['userId', 'achievementId'])
@Entity('user_achievements')
export class UserAchievement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  userId: string;

  @Column({ type: 'varchar', length: 128 })
  achievementId: string;

  @ManyToOne(() => Achievement, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'achievementId' })
  achievement: Achievement;

  /** XP awarded at the time of this grant (may differ if achievement was edited) */
  @Column({ type: 'int' })
  xpAwarded: number;

  /** Optional context: e.g. the eventId that triggered the award */
  @Column({ type: 'jsonb', nullable: true })
  context: Record<string, unknown> | null;

  @CreateDateColumn()
  awardedAt: Date;
}
