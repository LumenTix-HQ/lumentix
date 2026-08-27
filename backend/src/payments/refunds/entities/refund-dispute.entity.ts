import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { RefundDisputeStatus } from '../enums';

/**
 * Represents a refund dispute or chargeback filed by a user
 * against a payment or refund that was issued.
 */
@Entity('refund_disputes')
@Index(['paymentId'])
@Index(['userId'])
@Index(['status'])
@Index(['createdAt'])
export class RefundDispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Reference to the Payment being disputed.
   * Links this dispute to a specific payment transaction.
   */
  @Column({ type: 'uuid' })
  paymentId: string;

  /**
   * The user who filed the dispute.
   */
  @Column({ type: 'uuid' })
  userId: string;

  /**
   * Reason for the dispute (e.g., "service not provided", "partial refund inadequate").
   */
  @Column({ type: 'text' })
  reason: string;

  /**
   * Detailed description provided by the user.
   */
  @Column({ type: 'text' })
  description: string;

  /**
   * Current status of the dispute.
   */
  @Column({
    type: 'enum',
    enum: RefundDisputeStatus,
    default: RefundDisputeStatus.OPEN,
  })
  status: RefundDisputeStatus;

  /**
   * Amount originally requested for dispute resolution.
   */
  @Column({ type: 'decimal', precision: 18, scale: 7 })
  requestedAmount: number;

  /**
   * Amount approved for refund/credit as result of dispute.
   * May be different from requested amount.
   */
  @Column({ type: 'decimal', precision: 18, scale: 7, nullable: true })
  approvedAmount: number | null;

  /**
   * Currency of the dispute amounts.
   */
  @Column({ type: 'varchar', default: 'USD' })
  currency: string;

  /**
   * Whether user received partial benefit from the event despite cancellation.
   */
  @Column({ type: 'boolean', default: false })
  receivedPartialBenefit: boolean;

  /**
   * If partial benefit was received, what percentage (0-100) did they get.
   */
  @Column({ type: 'int', nullable: true })
  benefitPercentage: number | null;

  /**
   * Supporting documents (URLs or file IDs) provided by user.
   * Stored as array in JSONB.
   */
  @Column({ type: 'jsonb', nullable: true, default: null })
  supportingDocuments: string[] | null;

  /**
   * User's preferred resolution method.
   */
  @Column({ type: 'varchar', nullable: true })
  preferredResolution: 'full_refund' | 'partial_refund' | 'store_credit' | null;

  /**
   * Resolution notes from the reviewer/admin.
   */
  @Column({ type: 'text', nullable: true })
  resolutionNotes: string | null;

  /**
   * Admin/reviewer who handled the dispute.
   */
  @Column({ type: 'uuid', nullable: true })
  reviewedBy: string | null;

  /**
   * When the dispute was resolved.
   */
  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  /**
   * Metadata about the dispute for auditing/analytics.
   */
  @Column({ type: 'jsonb', nullable: true, default: null })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
