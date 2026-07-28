import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Tracks a user's participation and progress in a challenge.
 */
@Index(['challengeId', 'userId'], { unique: true })
@Index(['userId', 'completed'])
@Entity('challenge_participations')
export class ChallengeParticipation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  challengeId: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  userId: string;

  /** How far the user has progressed toward the challenge criteria */
  @Column({ type: 'int', default: 0 })
  progress: number;

  /** Whether the user has fully completed the challenge */
  @Column({ type: 'boolean', default: false })
  completed: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /** XP awarded when completed (snapshot at completion time) */
  @Column({ type: 'int', nullable: true })
  xpAwarded: number | null;

  @CreateDateColumn()
  joinedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
