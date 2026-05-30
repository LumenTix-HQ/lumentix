import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Category } from '../../categories/entities/category.entity';

export enum EventStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum EventAgeRestriction {
  NONE = 'none',
  EIGHTEEN_PLUS = '18+',
  TWENTY_ONE_PLUS = '21+',
}

export enum EventCategory {
  CONFERENCE = 'conference',
  WORKSHOP = 'workshop',
  MEETUP = 'meetup',
  CONCERT = 'concert',
  SPORTS = 'sports',
  FESTIVAL = 'festival',
  OTHER = 'other',
}

@Entity('events')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  location: string;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp' })
  endDate: Date;

  @Column({ type: 'decimal', precision: 18, scale: 8, default: 0 })
  ticketPrice: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column()
  organizerId: string;

  @Column({ nullable: true, type: 'uuid' })
  seriesId: string | null;

  @Column({
    type: 'enum',
    enum: EventStatus,
    default: EventStatus.DRAFT,
  })
  status: EventStatus;

  /**
   * Maximum number of attendees (ticket sales cap).
   * NULL means the event has no capacity limit.
   */
  @Column({ type: 'int', nullable: true, default: null })
  maxAttendees: number | null;

  /**
   * Stellar public key of this event's dedicated escrow account.
   * Populated when the event is published.
   */
  @Column({ nullable: true, type: 'varchar' })
  escrowPublicKey: string | null;

  /**
   * AES-256-GCM encrypted escrow secret key.
   * Format: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
   * NEVER expose this field in API responses.
   */
  @Column({ nullable: true, type: 'text', select: false })
  escrowSecretEncrypted: string | null;

  @Column({ nullable: true, type: 'varchar' })
  imageUrl: string | null;

  @Column({
    type: 'enum',
    enum: EventCategory,
    default: EventCategory.OTHER,
  })
  category: EventCategory;

  /**
   * Optional sponsorship funding goal in XLM.
   * NULL means no goal has been set.
   */
  @Column({ type: 'decimal', precision: 18, scale: 7, nullable: true, default: null })
  fundingGoal: number | null;

  @Column({
    type: 'enum',
    enum: EventAgeRestriction,
    default: EventAgeRestriction.NONE,
  })
  ageRestriction: EventAgeRestriction;

  @ManyToMany(() => Category, (c) => c.events)
  @JoinTable({ name: 'event_categories' })
  categories: Category[];

  /**
   * Timestamp when the escrow account was merged (closed) after a full refund.
   * NULL means the account has not been merged yet.
   */
  @Column({ type: 'timestamp', nullable: true, default: null })
  mergedAt: Date | null;
   * Optional webhook URL for outbound payment status notifications.
   * When set, a signed POST request is sent on each payment status transition.
   */
  @Column({ type: 'varchar', nullable: true, default: null })
  webhookUrl: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
