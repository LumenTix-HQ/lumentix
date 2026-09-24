import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { GeoFenceRuleType } from '../enums/geo-fence-rule-type.enum';

/**
 * Stores one geo-fence rule for a specific event.
 *
 * An event may have multiple rules. ALL rules that are enabled for
 * an event must pass for a ticket purchase to be allowed
 * (i.e. rules are combined with AND logic).
 *
 * Rule-type-specific configuration is stored in the `config` JSONB column:
 *
 * RADIUS:
 *   { "centerLat": 6.5244, "centerLng": 3.3792, "radiusKm": 50 }
 *
 * BOUNDING_BOX:
 *   { "minLat": 4.0, "maxLat": 14.0, "minLng": 2.0, "maxLng": 15.0 }
 *
 * COUNTRY_ALLOWLIST | COUNTRY_BLOCKLIST:
 *   { "countryCodes": ["NG", "GH", "KE"] }
 */
@Index(['eventId', 'isEnabled'])
@Entity({ name: 'geo_fence_rules' })
export class GeoFenceRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The event this rule applies to */
  @Index()
  @Column({ type: 'uuid' })
  eventId: string;

  /** UUID of the organizer who created / last modified this rule */
  @Column({ type: 'uuid' })
  createdBy: string;

  @Column({
    type: 'enum',
    enum: GeoFenceRuleType,
  })
  ruleType: GeoFenceRuleType;

  /**
   * Human-readable description of this rule, e.g.
   * "West Africa only" or "50 km radius around Lagos"
   */
  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  description: string | null;

  /**
   * JSONB configuration blob. Shape depends on ruleType — see class doc above.
   */
  @Column({ type: 'jsonb' })
  config: Record<string, unknown>;

  /** Soft-toggle: rule is evaluated only when this is true */
  @Column({ type: 'boolean', default: true })
  isEnabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
