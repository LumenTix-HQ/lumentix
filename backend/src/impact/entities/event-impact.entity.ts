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

@Entity('event_impact')
export class EventImpact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_id' })
  eventId: string;

  @ManyToOne(() => Event)
  @JoinColumn({ name: 'event_id' })
  event: Event;

  @Column({ type: 'jsonb', nullable: true })
  economicMetrics: {
    totalRevenue: number;
    localBusinessImpact: number;
    jobCreation: number;
    taxRevenue: number;
  };

  @Column({ type: 'jsonb', nullable: true })
  socialMetrics: {
    attendeeCount: number;
    communityEngagement: number;
    diversityScore: number;
    accessibilityRating: number;
  };

  @Column({ type: 'jsonb', nullable: true })
  environmentalMetrics: {
    carbonFootprint: number;
    wasteGenerated: number;
    energyConsumption: number;
    sustainabilityScore: number;
  };

  @Column({ type: 'jsonb', nullable: true })
  customMetrics: Record<string, any>;

  @Column({ default: 0 })
  overallImpactScore: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
