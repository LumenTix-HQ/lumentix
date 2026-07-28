import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum ResaleStatus {
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  PENDING = 'pending',
}

@Entity('resale_transactions')
@Index(['ticketId'])
@Index(['sellerId'])
@Index(['buyerId'])
export class ResaleTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ticketId: string;

  @Column()
  eventId: string;

  @Column()
  sellerId: string;

  @Column()
  buyerId: string;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  salePrice: number;

  @Column({ type: 'varchar', default: 'XLM' })
  currency: string;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  originalPrice: number;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  organizerFee: number;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  sellerPayout: number;

  @Column({ type: 'varchar', default: 'completed' })
  status: ResaleStatus;

  @Column({ type: 'varchar', nullable: true })
  transactionHash: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
