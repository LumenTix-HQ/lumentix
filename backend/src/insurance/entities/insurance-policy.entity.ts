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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
