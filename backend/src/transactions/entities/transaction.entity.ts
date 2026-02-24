import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum TransactionType {
  PAYMENT = 'payment',
  REFUND = 'refund',
  CONTRIBUTION = 'contribution',
}

export enum TransactionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  amount: number;

  @Column({ default: 'XLM' })
  currency: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
    default: TransactionType.PAYMENT,
  })
  type: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  /** UUID of the related payment, refund, or contribution record */
  @Column({ nullable: true, type: 'varchar' })
  referenceId: string | null;

  @Column({ nullable: true, type: 'varchar' })
  transactionHash: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
