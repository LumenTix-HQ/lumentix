import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UpgradeAuction } from './upgrade-auction.entity';

export type UpgradeBidStatus = 'active' | 'outbid' | 'won' | 'lost';

@Entity({ name: 'upgrade_bids' })
export class UpgradeBid {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  auctionId!: string;

  @ManyToOne(() => UpgradeAuction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'auctionId' })
  auction!: UpgradeAuction;

  @Column()
  ticketId!: string;

  @Column()
  bidderId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  amount!: number;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: UpgradeBidStatus;

  @CreateDateColumn()
  placedAt!: Date;
}
