import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

export enum PaymentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Index(['userId', 'status'])
@Index(['eventId', 'status'])
@Unique(['transactionHash'])
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index() // NEW
  @Index()
  @Column({ nullable: true })
  eventId: string | null;

  @Index()
  @Column({ nullable: true })
  seriesId: string | null;

  @Column({ default: false })
  isSeasonPass: boolean;

  @Index()
  @Column()
  userId: string;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  amount: number;

  @Column({ default: 'XLM' })
  currency: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  ticketTier: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  promoCode: string | null;

  @Column({ type: 'varchar', length: 32, default: 'ticket' })
  productType: 'ticket' | 'merch';

  @Column({ nullable: true, type: 'varchar' })
  transactionHash: string | null;

  /**
   * The signed Stellar transaction XDR, persisted before submission to
   * Horizon so a network timeout doesn't strand the payment with no way to
   * retry without rebuilding (and re-signing) the transaction. Cleared once
   * the payment reaches a terminal state (CONFIRMED or FAILED).
   */
  @Column({ nullable: true, type: 'text' })
  signedXdr: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @UpdateDateColumn()
  updatedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}