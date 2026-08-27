import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum MetricType {
  API_LATENCY = 'API_LATENCY',
  API_LOAD = 'API_LOAD',
  NODE_STATUS = 'NODE_STATUS',
  RESPONSE_TIME = 'RESPONSE_TIME',
  ERROR_RATE = 'ERROR_RATE',
  DB_QUERY_TIME = 'DB_QUERY_TIME',
}

@Index(['metricType', 'createdAt'])
@Index(['service', 'createdAt'])
@Entity('telemetry_metrics')
export class TelemetryMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32 })
  metricType: MetricType;

  @Column({ type: 'varchar', length: 64 })
  service: string;

  @Column({ type: 'decimal', precision: 18, scale: 3 })
  value: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  unit: string | null;

  @Column({ type: 'jsonb', nullable: true })
  tags: Record<string, string> | null;

  @CreateDateColumn()
  createdAt: Date;
}
