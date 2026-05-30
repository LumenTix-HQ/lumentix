import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EventCategory, EventAgeRestriction } from './event.entity';

@Entity('event_series')
export class EventSeries {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  location: string;

  @Column({ type: 'decimal', precision: 18, scale: 8, default: 0 })
  ticketPrice: number;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  seasonPassPrice: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  discountPercentage: number | null;

  @Column({ default: 'USD' })
  currency: string;

  @Column()
  organizerId: string;

  @Column({ type: 'int', nullable: true, default: null })
  maxAttendees: number | null;

  @Column({ nullable: true, type: 'varchar' })
  escrowPublicKey: string | null;

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

  @Column({
    type: 'enum',
    enum: EventAgeRestriction,
    default: EventAgeRestriction.NONE,
  })
  ageRestriction: EventAgeRestriction;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
