import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { VenueSection } from './venue-section.entity';

export enum SensorType {
  ENTRY_COUNTER   = 'entry_counter',   // counts people entering a zone
  EXIT_COUNTER    = 'exit_counter',    // counts people leaving a zone
  OCCUPANCY       = 'occupancy',       // infrared / PIR occupancy sensor
  WEIGHT_PLATE    = 'weight_plate',    // floor pressure sensor
  CAMERA_AI       = 'camera_ai',       // AI-vision people counter
  ENVIRONMENTAL   = 'environmental',   // CO₂ / temperature proxy for density
}

export enum SensorStatus {
  ONLINE   = 'online',
  OFFLINE  = 'offline',
  DEGRADED = 'degraded',   // reporting but with reduced accuracy
  FAULT    = 'fault',      // hardware fault detected
}

/**
 * Represents a physical IoT sensor installed in a venue section.
 * Sensors push readings via POST /venues/sensors/:sensorId/reading.
 */
@Index(['eventId', 'status'])
@Index(['sectionId'])
@Entity('iot_sensors')
export class IotSensor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Human-readable label, e.g. "Gate A Entry Counter" */
  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'enum', enum: SensorType })
  type: SensorType;

  @Column({ type: 'enum', enum: SensorStatus, default: SensorStatus.OFFLINE })
  status: SensorStatus;

  /** The event this sensor is monitoring */
  @Index()
  @Column({ type: 'varchar', length: 128 })
  eventId: string;

  /** Optional: the specific section this sensor covers (null = whole venue) */
  @Column({ type: 'varchar', nullable: true })
  sectionId: string | null;

  @ManyToOne(() => VenueSection, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sectionId' })
  section: VenueSection | null;

  /** Physical location description, e.g. "North entrance, pillar 3" */
  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  /** API key the sensor uses to authenticate its readings */
  @Column({ type: 'varchar', select: false })
  apiKey: string;

  /** Last raw reading value (meaning depends on sensor type) */
  @Column({ type: 'int', default: 0 })
  lastReading: number;

  /** Timestamp of the most recent reading */
  @Column({ type: 'timestamptz', nullable: true })
  lastReadingAt: Date | null;

  /** Cumulative entry count since sensor was activated */
  @Column({ type: 'int', default: 0 })
  cumulativeEntries: number;

  /** Cumulative exit count since sensor was activated */
  @Column({ type: 'int', default: 0 })
  cumulativeExits: number;

  /** Whether this sensor is actively used in capacity calculations */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
