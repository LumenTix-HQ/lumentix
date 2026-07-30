import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Event } from '../../events/entities/event.entity';

export enum BackgroundPattern {
  SOLID = 'solid',
  DOTS = 'dots',
  WAVES = 'waves',
  GRADIENT = 'gradient',
  CUSTOM_IMAGE = 'custom_image',
}

export interface TicketLayoutElement {
  key: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

@Entity({ name: 'ticket_designs' })
export class TicketDesign {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  eventId!: string;

  @ManyToOne(() => Event, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event!: Event;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'enum', enum: BackgroundPattern, default: BackgroundPattern.SOLID })
  backgroundPattern!: BackgroundPattern;

  /** Required when backgroundPattern is CUSTOM_IMAGE. */
  @Column({ type: 'varchar', nullable: true })
  backgroundImageUrl!: string | null;

  @Column({ type: 'varchar', length: 16, default: '#FFFFFF' })
  backgroundColor!: string;

  @Column({ type: 'varchar', length: 16, default: '#000000' })
  textColor!: string;

  @Column({ type: 'varchar', length: 16, default: '#6366F1' })
  accentColor!: string;

  @Column({ type: 'varchar', nullable: true })
  logoUrl!: string | null;

  @Column({ type: 'jsonb', default: [] })
  layout!: TicketLayoutElement[];

  @Column({ default: false })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
