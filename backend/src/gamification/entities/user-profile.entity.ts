import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Gamification profile for a user.
 * One row per user, upserted whenever XP changes.
 */
@Entity('gamification_profiles')
export class GamificationProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  userId: string;

  /** Total XP accumulated across all activities */
  @Column({ type: 'int', default: 0 })
  totalXp: number;

  /** Current level derived from totalXp (level = floor(sqrt(totalXp / 100)) + 1) */
  @Column({ type: 'int', default: 1 })
  level: number;

  /** Total tickets purchased */
  @Column({ type: 'int', default: 0 })
  ticketsPurchased: number;

  /** Total verified reviews written */
  @Column({ type: 'int', default: 0 })
  reviewsWritten: number;

  /** Total events attended (ticket status = used) */
  @Column({ type: 'int', default: 0 })
  eventsAttended: number;

  /** Total events hosted (as organizer) */
  @Column({ type: 'int', default: 0 })
  eventsHosted: number;

  /** Total social shares recorded */
  @Column({ type: 'int', default: 0 })
  socialShares: number;

  /** Distinct event categories attended (stored as array) */
  @Column({ type: 'jsonb', default: [] })
  categoriesAttended: string[];

  /** Current leaderboard rank (updated by update_leaderboard) */
  @Column({ type: 'int', nullable: true })
  leaderboardRank: number | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
