import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Organizer-configured resale price ceiling for an event. Persisted so the
 * cap survives restarts and is shared by every API instance.
 */
@Entity('resale_price_ceilings')
export class ResalePriceCeiling {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  eventId: string;

  /** Max resale multiplier in basis points (15000 = 150% of face value). */
  @Column({ type: 'int' })
  ceilingMultiplierBps: number;

  /** Hard cap in the event currency (0 = disabled). */
  @Column({ type: 'decimal', precision: 18, scale: 7, default: 0 })
  absoluteCeiling: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
