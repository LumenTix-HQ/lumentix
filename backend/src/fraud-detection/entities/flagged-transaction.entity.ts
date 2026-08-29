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
import { User } from '../../users/entities/user.entity';
import { Event } from '../../events/entities/event.entity';

export enum FraudFlagReason {
  WASH_TRADING = 'WASH_TRADING',
  BOT_ACTIVITY = 'BOT_ACTIVITY',
  SUSPICIOUS_PRICING = 'SUSPICIOUS_PRICING',
  UNUSUAL_VELOCITY = 'UNUSUAL_VELOCITY',
  PATTERN_MATCHING = 'PATTERN_MATCHING',
}

export enum FlagStatus {
  PENDING = 'pending',
  REVIEWED = 'reviewed',
  CLEARED = 'cleared',
  CONFIRMED_FRAUD = 'confirmed_fraud',
  ACTION_TAKEN = 'action_taken',
}

@Entity('flagged_transactions')
export class FlaggedTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * The secondary market transaction hash/ID
   */
  @Index()
  @Column()
  transactionHash: string;

  /**
   * Event where resale occurred
   */
  @ManyToOne(() => Event, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'eventId' })
  event: Event | null;

  @Index()
  @Column({ nullable: true })
  eventId: string | null;

  /**
   * Seller of the ticket
   */
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'sellerId' })
  seller: User | null;

  @Column({ nullable: true })
  sellerId: string | null;

  /**
   * Buyer of the ticket
   */
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'buyerId' })
  buyer: User | null;

  @Column({ nullable: true })
  buyerId: string | null;

  /**
   * Original ticket price
   */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  originalPrice: number;

  /**
   * Resale price
   */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  salePrice: number;

  /**
   * Reason for flagging
   */
  @Column({
    type: 'enum',
    enum: FraudFlagReason,
  })
  flagReason: FraudFlagReason;

  /**
   * Risk score (0-1), higher = more suspicious
   */
  @Column({ type: 'decimal', precision: 3, scale: 2 })
  riskScore: number;

  /**
   * Detailed fraud indicators detected
   */
  @Column({
    type: 'jsonb',
    nullable: true,
    default: null,
  })
  fraudIndicators: {
    priceDeviation?: number;
    velocityIndex?: number;
    buyerTransactionCount?: number;
    sellerTransactionCount?: number;
    timeBetweenPurchaseAndResale?: number;
    walletAgeInDays?: number;
    isNewAccount?: boolean;
    matchedPatterns?: string[];
  } | null;

  /**
   * Current status of the flag
   */
  @Column({
    type: 'enum',
    enum: FlagStatus,
    default: FlagStatus.PENDING,
  })
  status: FlagStatus;

  /**
   * Reviewer notes
   */
  @Column({ type: 'text', nullable: true, default: null })
  reviewNotes: string | null;

  /**
   * User who reviewed this flag
   */
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewedBy' })
  reviewer: User | null;

  @Column({ nullable: true })
  reviewedBy: string | null;

  /**
   * Action taken (if status is ACTION_TAKEN)
   */
  @Column({
    type: 'jsonb',
    nullable: true,
    default: null,
  })
  actionTaken: {
    type?: 'TRANSACTION_REVERSED' | 'ACCOUNT_SUSPENDED' | 'FUNDS_HELD' | 'WARNING_ISSUED';
    details?: string;
    timestamp?: string;
  } | null;

  @CreateDateColumn()
  flaggedAt: Date;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  reviewedAt: Date | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
