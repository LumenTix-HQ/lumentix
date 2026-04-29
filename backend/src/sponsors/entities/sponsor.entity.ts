import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Event } from '../../events/entities/event.entity';
import { User } from '../../users/entities/user.entity';
import { SponsorTier } from './sponsor-tier.entity';

@Entity('sponsors')
export class Sponsor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  eventId: string;

  @ManyToOne(() => Event, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: Event;

  @Index()
  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  amount: number;

  @Column({ nullable: true, type: 'uuid' })
  tierId: string | null;

  @ManyToOne(() => SponsorTier, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tierId' })
  tier: SponsorTier | null;

  @CreateDateColumn()
  createdAt: Date;
}
