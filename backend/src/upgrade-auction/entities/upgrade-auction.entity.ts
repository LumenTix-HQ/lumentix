import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Event } from '../../events/entities/event.entity';

export type UpgradeAuctionStatus = 'open' | 'finalized' | 'cancelled';

@Entity({ name: 'upgrade_auctions' })
export class UpgradeAuction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  eventId!: string;

  @ManyToOne(() => Event, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event!: Event;

  @Column({ type: 'varchar', length: 128 })
  seatTier!: string;

  @Column({ type: 'int' })
  slotsAvailable!: number;

  @Column({ type: 'int', default: 0 })
  slotsAwarded!: number;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  startingPrice!: number;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  minIncrement!: number;

  @Column({ type: 'varchar', length: 16, default: 'USD' })
  currency!: string;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: UpgradeAuctionStatus;

  @Column({ type: 'timestamptz', nullable: true })
  opensAt!: Date | null;

  @Column({ type: 'timestamptz' })
  closesAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finalizedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
