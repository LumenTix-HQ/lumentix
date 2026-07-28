import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Event } from '../../events/entities/event.entity';

export enum SeatCategoryName {
  GENERAL = 'General',
  PREMIUM = 'Premium',
  VIP = 'VIP',
  BOX = 'Box',
  BALCONY = 'Balcony',
}

@Entity('venue_sections')
export class VenueSection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  eventId: string;

  @ManyToOne(() => Event, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: Event;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: SeatCategoryName })
  category: SeatCategoryName;

  @Column({ type: 'int' })
  rows: number;

  @Column({ type: 'int' })
  seatsPerRow: number;

  @CreateDateColumn()
  createdAt: Date;
}
