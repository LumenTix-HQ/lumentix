import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PolicyStatus } from '../enums/policy-status.enum';
import { InsuranceProduct } from './insurance-product.entity';

/**
 * A purchased insurance policy — one per (user × product × event) combination.
 */
@Index(['userId', 'status'])
@Index(['eventId', 'status'])
@Entity('insurance_policies')
export class InsurancePolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The attendee / organiser who purchased this policy. */
  @Index()
  @Column()
  userId: string;

  /** The event the policy covers. */
  @Index()
  @Column()
  eventId: string;

  @Index()
  @Column()
  productId: string;

  @ManyToOne(() => InsuranceProduct, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: InsuranceProduct;

  /** Premium actually paid by the policyholder. */
  @Column({ type: 'decimal', precision: 18, scale: 2 })
  premiumPaid: number;

  @Column({ default: 'USD' })
} from 'typeorm';

export enum InsurancePolicyStatus {
  ACTIVE = 'active',
  CLAIMED = 'claimed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
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
    enum: PolicyStatus,
    default: PolicyStatus.PENDING_PAYMENT,
  })
  status: PolicyStatus;

  /** Policy becomes active from this timestamp. */
  @Column({ type: 'timestamptz', nullable: true, default: null })
  effectiveFrom: Date | null;

  /** Policy expires at this timestamp (typically the event end date). */
  @Column({ type: 'timestamptz', nullable: true, default: null })
  effectiveTo: Date | null;

  /** Unique policy reference number shown to the customer. */
  @Index({ unique: true })
  @Column({ type: 'varchar', nullable: true, default: null })
  policyNumber: string | null;

  /** Transaction hash of the premium payment (Stellar or other). */
  @Column({ type: 'varchar', nullable: true, default: null })
  paymentTxHash: string | null;

  /** Snapshot of coverage terms at purchase time — immutable after issue. */
  @Column({ type: 'jsonb', default: {} })
  coverageSnapshot: Record<string, unknown>;
    enum: InsurancePolicyStatus,
    default: InsurancePolicyStatus.ACTIVE,
  })
  status: InsurancePolicyStatus;

  /** Cancellation reason provided when a claim was filed */
  @Column({ type: 'varchar', nullable: true })
  claimReason: string | null;

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
