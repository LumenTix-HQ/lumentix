import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Check,
} from 'typeorm';

export enum ReviewStatus {
  PENDING = 'pending',     // submitted, awaiting attendance verification
  VERIFIED = 'verified',   // attendance confirmed, review is live
  REJECTED = 'rejected',   // failed attendance verification
  FLAGGED = 'flagged',     // flagged for moderation
}

/**
 * Stores a verified attendee review for an event.
 *
 * Anti-fake-review guarantees:
 *  - reviewerId + eventId must be unique (one review per attendee per event)
 *  - attendanceVerified must be true before status becomes VERIFIED
 *  - ticketId links back to the used ticket that proves attendance
 */
@Index(['eventId', 'status'])
@Index(['reviewerId', 'eventId'], { unique: true })
@Index(['organizerId'])
@Check('"rating" >= 1 AND "rating" <= 5')
@Entity('event_reviews')
export class EventReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** UUID of the event being reviewed */
  @Index()
  @Column({ type: 'varchar', length: 128 })
  eventId: string;

  /** UUID of the user writing the review */
  @Index()
  @Column({ type: 'varchar', length: 128 })
  reviewerId: string;

  /** UUID of the event organizer — denormalised for fast reputation queries */
  @Index()
  @Column({ type: 'varchar', length: 128 })
  organizerId: string;

  /**
   * UUID of the ticket that proves attendance.
   * Must have status = 'used' at submission time.
   */
  @Column({ type: 'varchar', length: 128 })
  ticketId: string;

  /** Star rating 1–5 */
  @Column({ type: 'smallint' })
  rating: number;

  /** Optional free-text review body */
  @Column({ type: 'text', nullable: true })
  comment: string | null;

  /** True once validate_reviewer_attendance confirms the ticket was used */
  @Column({ type: 'boolean', default: false })
  attendanceVerified: boolean;

  @Column({
    type: 'enum',
    enum: ReviewStatus,
    default: ReviewStatus.PENDING,
  })
  status: ReviewStatus;

  /**
   * Stellar transaction hash of the on-chain review submission.
   * Populated when the review is anchored to the blockchain.
   */
  @Column({ type: 'varchar', nullable: true })
  blockchainTxHash: string | null;

  /** Timestamp when attendance was verified */
  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
