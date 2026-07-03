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

@Entity('sustainability_metrics')
export class SustainabilityMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_id' })
  eventId: string;

  @ManyToOne(() => Event)
  @JoinColumn({ name: 'event_id' })
  event: Event;

  @Column({ name: 'metric_type' })
  metricType: 'carbon' | 'waste' | 'energy' | 'water' | 'transport' | 'custom';

  @Column({ name: 'metric_name' })
  metricName: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  value: number;

  @Column({ type: 'varchar', length: 50 })
  unit: string;

  @Column({ type: 'jsonb', nullable: true })
  breakdown: Record<string, number>;

  @Column({ type: 'timestamp', nullable: true })
  measuredAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
