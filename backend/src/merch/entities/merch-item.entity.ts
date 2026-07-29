import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Event } from '../../events/entities/event.entity';
import { VipTierName } from '../../vip/entities/vip-tier.entity';

export type TokenGateType = 'ticket_nft' | 'vip_badge';

@Entity({ name: 'merch_items' })
export class MerchItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  eventId!: string;

  @ManyToOne(() => Event, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event!: Event;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  price!: number;

  @Column({ type: 'varchar', length: 16, default: 'USD' })
  currency!: string;

  @Column({ type: 'int' })
  totalStock!: number;

  @Column({ type: 'int', default: 0 })
  reservedStock!: number;

  @Column({ default: false })
  isTokenGated!: boolean;

  @Column({ type: 'varchar', length: 16, nullable: true })
  gateType!: TokenGateType | null;

  /** Required ticket NFT asset code, when gateType is 'ticket_nft'. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  requiredAssetCode!: string | null;

  /** Required VIP tier name, when gateType is 'vip_badge'. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  requiredVipTier!: VipTierName | null;

  @CreateDateColumn()
  createdAt!: Date;
}
