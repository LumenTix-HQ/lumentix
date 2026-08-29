import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Event } from '../../events/entities/event.entity';

@Index(['eventId', 'createdAt'])
@Index(['eventId', 'gateId'])
@Entity('scan_metrics')
export class ScanMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  eventId: string;

  @ManyToOne(() => Event, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: Event;

  @Column({ type: 'varchar', length: 64, nullable: true })
  gateId: string | null;

  @Column({ type: 'integer' })
  scansPerMinute: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  avgScanTimeMs: number;

  @Column({ type: 'integer', default: 0 })
  totalScansInWindow: number;

  @Column({ type: 'integer', default: 0 })
  failedScans: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  errorRate: number;

  @CreateDateColumn()
  recordedAt: Date;
}
