import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One viewer's playback session for one event.
 *
 * `StreamingConfig` holds the organizer-side ladder shared by every viewer;
 * this holds the per-viewer state the adaptive bitrate controller needs —
 * measured bandwidth, the tier currently being served, and whether the viewer
 * has pinned a tier manually.
 */
@Entity('viewer_stream_sessions')
@Index(['eventId', 'viewerId'], { unique: true })
export class ViewerStreamSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  eventId: string;

  @Column({ type: 'uuid' })
  viewerId: string;

  /** Most recent bandwidth estimate in kbps. */
  @Column({ type: 'int', default: 0 })
  measuredBandwidthKbps: number;

  /**
   * Smoothed bandwidth in kbps. Tier decisions read this rather than the raw
   * measurement so one slow segment does not drop the viewer a tier.
   */
  @Column({ type: 'int', default: 0 })
  smoothedBandwidthKbps: number;

  /** Profile currently being served, e.g. `720p`. */
  @Column({ type: 'varchar', default: 'auto' })
  currentTier: string;

  /** Bitrate of `currentTier` in kbps. */
  @Column({ type: 'int', default: 0 })
  currentBitrateKbps: number;

  /**
   * Tier the viewer pinned manually, or `null` while on automatic.
   * A manual override suppresses automatic switching until it is cleared.
   */
  @Column({ type: 'varchar', nullable: true })
  manualTierOverride: string | null;

  /** Buffering stalls reported during this session. */
  @Column({ type: 'int', default: 0 })
  bufferingEventCount: number;

  /** Total stalled milliseconds across the session. */
  @Column({ type: 'int', default: 0 })
  totalBufferingMs: number;

  /** Most recent stall, used to decide whether stalls are still recent. */
  @Column({ type: 'timestamptz', nullable: true })
  lastBufferingAt: Date | null;

  /** Tier changes so far, kept newest-last. */
  @Column({ type: 'jsonb', default: [] })
  switchHistory: Array<{
    at: string;
    fromTier: string;
    toTier: string;
    reason: string;
  }>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
