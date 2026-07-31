import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type TelemetryServiceName = 'database' | 'redis' | 'stellar' | string;
export type TelemetryMetricType = 'ping_latency' | 'custom';
export type TelemetryNodeStatus = 'up' | 'down' | 'degraded';

@Index(['service', 'recordedAt'])
@Entity({ name: 'telemetry_metrics' })
export class TelemetryMetric {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  service!: TelemetryServiceName;

  @Column({ type: 'varchar', length: 32, default: 'custom' })
  metricType!: TelemetryMetricType;

  @Column({ type: 'float' })
  value!: number;

  @Column({ type: 'varchar', length: 16, default: 'ms' })
  unit!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  status!: TelemetryNodeStatus | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  recordedAt!: Date;
}
