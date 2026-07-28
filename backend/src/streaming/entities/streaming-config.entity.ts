import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('streaming_configs')
export class StreamingConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  eventId: string;

  @Column({ type: 'varchar', nullable: true })
  cdnBaseUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  streamUrl: string | null;

  @Column({ type: 'varchar', default: 'auto' })
  qualityProfile: string;

  @Column({ type: 'int', default: 2500 })
  targetBitrateKbps: number;

  @Column({ type: 'boolean', default: true })
  adaptiveBitrate: boolean;

  @Column({ type: 'jsonb', default: {} })
  deliveryConfig: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  performanceMetrics: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
