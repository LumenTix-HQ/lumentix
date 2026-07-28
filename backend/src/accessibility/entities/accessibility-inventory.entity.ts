import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Event } from '../../events/entities/event.entity';

export enum AccessibilityType {
  WHEELCHAIR = 'wheelchair',
  HEARING = 'hearing',
  VISUAL = 'visual',
  OTHER = 'other',
}

@Entity('accessibility_inventory')
export class AccessibilityInventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  eventId: string;

  @ManyToOne(() => Event, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: Event;

  @Column({ type: 'enum', enum: AccessibilityType })
  type: AccessibilityType;

  @Column({ type: 'int' })
  totalSlots: number;

  @Column({ default: 0 })
  bookedSlots: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;
}
