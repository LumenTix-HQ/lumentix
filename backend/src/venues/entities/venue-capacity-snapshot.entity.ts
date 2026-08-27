import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum CapacityAlertLevel {
  NORMAL   = 'normal',    // < 70 %
  WARNING  = 'warning',   // 70–85 %
  CRITICAL = 'critical',  // 85–95 %
  OVER     = 'over',      // > 95 % — action required
}

/**
 * Time-series snapshot of venue occupancy captured by IoT sensors.
 * Written every time monitor_venue_capacity runs or a sensor pushes a reading.
 * Kept for analytics, trend analysis, and audit.
 */
@Index(['eventId', 'createdAt'])
@Entity('venue_capacity_snapshots')
export class VenueCapacitySnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  eventId: string;

  /** Tickets sold (confirmed payments) at snapshot time */
  @Column({ type: 'int' })
  ticketsSold: number;

  /** Actual people physically inside the venue (sensor-derived) */
  @Column({ type: 'int' })
  actualOccupancy: number;

  /** Configured hard capacity limit at snapshot time */
  @Column({ type: 'int', nullable: true })
  capacityLimit: number | null;

  /** Occupancy as a percentage of capacity limit (0–100+) */
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  occupancyPercent: number;

  /** Number of active sensors contributing to this snapshot */
  @Column({ type: 'int', default: 0 })
  activeSensorCount: number;

  @Column({
    type: 'enum',
    enum: CapacityAlertLevel,
    default: CapacityAlertLevel.NORMAL,
  })
  alertLevel: CapacityAlertLevel;

  /** Per-section breakdown: { sectionId: occupancy } */
  @Column({ type: 'jsonb', nullable: true })
  sectionBreakdown: Record<string, number> | null;

  /** Optimisation recommendations generated at this snapshot */
  @Column({ type: 'jsonb', nullable: true })
  recommendations: string[] | null;

  @CreateDateColumn()
  createdAt: Date;
}
