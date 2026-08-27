import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Event } from '../../events/entities/event.entity';

export enum VipTierName {
  BRONZE = 'bronze',
  SILVER = 'silver',
  GOLD = 'gold',
  PLATINUM = 'platinum',
}

@Entity('vip_tiers')
export class VipTier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  eventId: string;

  @ManyToOne(() => Event, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: Event;

  @Column({
    type: 'enum',
    enum: VipTierName,
  })
  name: VipTierName;

  @Column({ type: 'decimal', precision: 18, scale: 8, default: 0 })
  price: number;

  @Column({ type: 'int' })
  maxSlots: number;

  @Column({ default: 0 })
  filledSlots: number;

  @Column({ type: 'jsonb', nullable: true })
  benefits: string[];

  @CreateDateColumn()
  createdAt: Date;
}
