import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum MobileWalletType {
  APPLE_PAY = 'apple_pay',
  GOOGLE_PAY = 'google_pay',
  SAMSUNG_PAY = 'samsung_pay',
}

export enum MobilePaymentStatus {
  INITIATED = 'initiated',
  AUTHORIZED = 'authorized',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Index(['userId', 'status'])
@Index(['walletType', 'status'])
@Entity('mobile_payments')
export class MobilePayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  eventId: string;

  @Column({ nullable: true })
  paymentIntentId: string | null;

  @Column({
    type: 'enum',
    enum: MobileWalletType,
  })
  walletType: MobileWalletType;

  @Column({
    type: 'enum',
    enum: MobilePaymentStatus,
    default: MobilePaymentStatus.INITIATED,
  })
  status: MobilePaymentStatus;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  amount: number;

  @Column({ default: 'XLM' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  walletToken: string | null;

  @Column({ type: 'text', nullable: true })
  transactionHash: string | null;

  @Column({ type: 'varchar', nullable: true })
  gatewayReference: string | null;

  @Column({ type: 'jsonb', nullable: true })
  gatewayResponse: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
