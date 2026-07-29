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
import { ClaimStatus } from '../enums/claim-status.enum';
import { InsurancePolicy } from './insurance-policy.entity';

/**
 * A claim raised by a policyholder against an active InsurancePolicy.
 */
@Index(['policyId', 'status'])
@Entity('insurance_claims')
export class InsuranceClaim {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  policyId: string;

  @ManyToOne(() => InsurancePolicy, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'policyId' })
  policy: InsurancePolicy;

  /** Claimant — denormalised from policy.userId for fast lookups. */
  @Index()
  @Column()
  claimantUserId: string;

  @Column({ type: 'text' })
  description: string;

  /** Amount requested by the claimant. */
  @Column({ type: 'decimal', precision: 18, scale: 2 })
  requestedAmount: number;

  /** Amount approved for payout (set by insurer during review). */
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true, default: null })
  approvedAmount: number | null;

  @Column({
    type: 'enum',
    enum: ClaimStatus,
    default: ClaimStatus.SUBMITTED,
  })
  status: ClaimStatus;

  /** Internal notes added by the reviewing insurer / adjuster. */
  @Column({ type: 'text', nullable: true, default: null })
  reviewNotes: string | null;

  /** Supporting evidence: array of file URLs or descriptions. */
  @Column({ type: 'jsonb', default: [] })
  evidenceUrls: string[];

  /** User ID of the insurer staff member who reviewed the claim. */
  @Column({ type: 'varchar', nullable: true, default: null })
  reviewedByUserId: string | null;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  reviewedAt: Date | null;

  /** Transaction hash of the claim payout (if PAID). */
  @Column({ type: 'varchar', nullable: true, default: null })
  payoutTxHash: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
