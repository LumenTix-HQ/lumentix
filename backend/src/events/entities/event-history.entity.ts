import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('event_history')
export class EventHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  eventId: string;

  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true, default: null })
  ticketSummary: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true, default: null })
  paymentSummary: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true, default: null })
  sponsorshipSummary: Record<string, unknown> | null;

  @Column({ type: 'int', default: 0 })
  totalTicketsSold: number;

  @Column({ type: 'int', default: 0 })
  totalTicketsUsed: number;

  @Column({ type: 'decimal', precision: 18, scale: 8, default: 0 })
  totalRevenue: number;

  @Column({ type: 'decimal', precision: 18, scale: 8, default: 0 })
  totalSponsorship: number;

  @CreateDateColumn()
  archivedAt: Date;
}
