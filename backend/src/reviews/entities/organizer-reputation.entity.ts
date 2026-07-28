import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Materialised reputation score for an event organizer.
 * Recomputed by calculate_reputation_score whenever a new verified review lands.
 *
 * Score formula (0–100):
 *   base        = (averageRating / 5) * 60          → up to 60 pts from star average
 *   volume      = min(totalReviews / 50, 1) * 20    → up to 20 pts for review volume
 *   consistency = (1 - stdDev / 2) * 20             → up to 20 pts for low variance
 */
@Entity('organizer_reputations')
export class OrganizerReputation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** UUID of the organizer this score belongs to */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  organizerId: string;

  /** Weighted reputation score 0–100 */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  reputationScore: number;

  /** Simple arithmetic mean of all verified ratings */
  @Column({ type: 'decimal', precision: 4, scale: 2, default: 0 })
  averageRating: number;

  /** Total number of verified reviews */
  @Column({ type: 'int', default: 0 })
  totalReviews: number;

  /** Distribution: count of each star rating 1–5 */
  @Column({ type: 'jsonb', default: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } })
  ratingDistribution: Record<string, number>;

  /** Standard deviation of ratings (used for consistency score) */
  @Column({ type: 'decimal', precision: 4, scale: 3, default: 0 })
  ratingStdDev: number;

  /** Timestamp of the last score recalculation */
  @UpdateDateColumn()
  lastCalculatedAt: Date;
}
