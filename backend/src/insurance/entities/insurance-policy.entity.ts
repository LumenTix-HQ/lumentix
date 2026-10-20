import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum InsurancePolicyStatus {
  ACTIVE = 'active',
  CLAIMED = 'claimed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  /** Claim escalated by auto-adjudication; awaiting a human reviewer. */
  UNDER_REVIEW = 'under_review',
  /** Claim rejected by a human reviewer; the policy pays out nothing. */
  CLAIM_REJECTED = 'claim_rejected',
}

/**
 * Tracks insurance policies purchased by ticket holders.
 * Premium = 10% of ticket price; coverage = full ticket price refund on valid cancellation.
 * On-chain state is managed by the Soroban LumentixContract; this entity mirrors it for
 * fast off-chain queries and audit trails.
 */
@Index(['ticketId'], { unique: true })
@Index(['userId', 'status'])
@Entity('insurance_policies')
export class InsurancePolicyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** UUID of the ticket this policy covers */
  @Index()
  @Column({ type: 'varchar', length: 128 })
  ticketId: string;

  /** UUID of the event this policy covers */
  @Index()
  @Column({ type: 'varchar', length: 128 })
  eventId: string;

  /** UUID of the user who purchased the policy */
  @Index()
  @Column({ type: 'varchar', length: 128 })
  userId: string;

  /** Premium paid (10% of ticket price) */
  @Column({ type: 'decimal', precision: 18, scale: 7 })
  premiumPaid: number;

  /** Coverage amount (full ticket price) */
  @Column({ type: 'decimal', precision: 18, scale: 7 })
  coverageAmount: number;

  /** Asset code used for the premium payment (e.g. XLM, USDC) */
  @Column({ type: 'varchar', length: 16, default: 'XLM' })
  currency: string;

  @Column({
    type: 'enum',
    enum: InsurancePolicyStatus,
    default: InsurancePolicyStatus.ACTIVE,
  })
  status: InsurancePolicyStatus;

  /** Cancellation reason provided when a claim was filed */
  @Column({ type: 'varchar', nullable: true })
  claimReason: string | null;

  /** Why auto-adjudication sent the claim to a human reviewer */
  @Column({ type: 'varchar', nullable: true })
  escalationReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  escalatedAt: Date | null;

  /** Admin who approved or rejected an escalated claim */
  @Column({ type: 'varchar', length: 128, nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  reviewNote: string | null;

  /** Stellar transaction hash of the premium payment */
  @Column({ type: 'varchar', nullable: true })
  premiumTransactionHash: string | null;

  /** Stellar transaction hash of the claim payout */
  @Column({ type: 'varchar', nullable: true })
  claimTransactionHash: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
