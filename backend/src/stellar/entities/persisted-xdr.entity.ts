import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum XdrStatus {
  PENDING = 'pending',
  BROADCAST = 'broadcast',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  RETRYING = 'retrying',
}

@Entity('persisted_xdrs')
@Index(['status', 'createdAt'])
export class PersistedXdr {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  xdr: string;

  @Column()
  networkPassphrase: string;

  @Column({ nullable: true })
  transactionHash: string | null;

  @Column({ type: 'varchar', default: XdrStatus.PENDING })
  @Index()
  status: XdrStatus;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ nullable: true, type: 'text' })
  lastError: string | null;

  @Column({ nullable: true, type: 'timestamptz' })
  nextRetryAt: Date | null;

  @Column({ nullable: true })
  paymentId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
