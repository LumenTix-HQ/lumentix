import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Event } from './event.entity';

@Entity('event_images')
export class EventImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  eventId: string;

  @ManyToOne(() => Event, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: Event;

  @Column()
  url: string;

  @Column({ nullable: true, type: 'varchar' })
  alt: string | null;

  @Column({ type: 'int', default: 0 })
  order: number;

  @Column({ type: 'boolean', default: false })
  isPrimary: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
