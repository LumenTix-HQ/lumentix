import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MerchItem } from './merch-item.entity';

export type MerchReservationStatus = 'reserved' | 'released' | 'purchased';

@Entity({ name: 'merch_reservations' })
export class MerchReservation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  merchItemId!: string;

  @ManyToOne(() => MerchItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchItemId' })
  merchItem!: MerchItem;

  @Column()
  buyerId!: string;

  /** Ticket or VIP assignment id used as proof of token-gate eligibility. */
  @Column({ type: 'varchar', nullable: true })
  proofId!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'reserved' })
  status!: MerchReservationStatus;

  @CreateDateColumn()
  reservedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  releasedAt!: Date | null;
}
