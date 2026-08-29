import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { DisputeClaimType } from '../enums/dispute-claim-type.enum';
import { ArbitrationVerdict } from '../enums/arbitration-verdict.enum';

/**
 * Tracks a dispute claim filed by a user when an event is falsely described
 * or cancelled, along with arbitrator assignment and resolution.
 */
@Entity('dispute_arbitrations')
@Index(['paymentId'])
@Index(['claimantId'])
@Index(['status'])
export class DisputeArbitration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Reference to the Payment being disputed */
  @Column({ type: 'uuid' })
  paymentId: string;

  /** The user who filed the dispute claim */
  @Column({ type: 'uuid' })
  claimantId: string;

  /** The event organizer / respondent */
  @Column({ type: 'uuid' })
  respondentId: string;

  /** The event that is the subject of the dispute */
  @Column({ type: 'uuid' })
  eventId: string;

  /** Type of claim being filed */
  @Column({
    type: 'enum',
    enum: DisputeClaimType,
  })
  claimType: DisputeClaimType;

  /** Detailed description of the claim */
  @Column({ type: 'text' })
  description: string;

  /** Evidence provided by claimant (URLs or file IDs) */
  @Column({ type: 'jsonb', nullable: true, default: null })
  evidence: string[] | null;

  /**
   * Status of the arbitration:
   *   open → assigned → under_review → resolved
   */
  @Column({ type: 'varchar', default: 'open' })
  status: string;

  /** IDs of assigned arbitrators */
  @Column({ type: 'jsonb', default: [] })
  arbitratorIds: string[];

  /** The final verdict reached by the arbitrator(s) */
  @Column({
    type: 'enum',
    enum: ArbitrationVerdict,
    nullable: true,
  })
  verdict: ArbitrationVerdict | null;

  /** Reasoning provided by the arbitrator(s) for the verdict */
  @Column({ type: 'text', nullable: true })
  verdictReason: string | null;

  /** Amount awarded to the claimant (partial refund) */
  @Column({ type: 'decimal', precision: 18, scale: 7, nullable: true })
  awardedAmount: number | null;

  /** Currency of the awarded amount */
  @Column({ type: 'varchar', default: 'USD' })
  currency: string;

  /** ID of the admin who closed/resolved the arbitration */
  @Column({ type: 'uuid', nullable: true })
  resolvedBy: string | null;

  /** Timestamp when the arbitration was resolved */
  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

