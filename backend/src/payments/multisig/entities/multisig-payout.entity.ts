import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum PayoutStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  EXECUTED = 'executed',
  FAILED = 'failed',
}

@Entity('multisig_payouts')
@Index(['eventId', 'status'])
@Index(['status'])
export class MultisigPayout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  eventId: string;

  @Column({ type: 'varchar', length: 56 })
  organizerWallet: string;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  amount: string;

  @Column({ type: 'varchar', length: 10, default: 'XLM' })
  currency: string;

  @Column({ type: 'int', default: 2 })
  requiredSignatures: number;

  @Column({ type: 'jsonb', default: {} })
  signatures: Record<string, string>;

  @Column({ type: 'varchar', length: 20, default: PayoutStatus.PENDING })
  status: PayoutStatus;

  @Column({ type: 'varchar', length: 128, nullable: true })
  transactionHash: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
