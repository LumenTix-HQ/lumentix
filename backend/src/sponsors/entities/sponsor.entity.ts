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

  @Column({ nullable: true, type: 'varchar' })
  displayName: string | null;

  @Column({ nullable: true, type: 'varchar' })
  logoUrl: string | null;

  @Column({ nullable: true, type: 'varchar' })
  websiteUrl: string | null;

  /**
   * Relative weight used by the banner rotation algorithm — higher weight
   * means the sponsor's banner is shown more often. Defaults to 1 (equal odds).
   */
  @Column({ type: 'int', default: 1 })
  weight: number;

  /**
   * Whether this sponsor's banner is eligible for rotation on the event page.
   */
  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  impressionCount: number;

  @Column({ type: 'int', default: 0 })
  clickCount: number;

  @CreateDateColumn()
  createdAt: Date;
}
