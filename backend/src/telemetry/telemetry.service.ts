import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import Redis from 'ioredis';
import { StellarService } from '../stellar/stellar.service';
import {
  TelemetryMetric,
  TelemetryNodeStatus,
} from './entities/telemetry-metric.entity';
import { RecordMetricDatapointDto } from './dto/record-metric-datapoint.dto';

export interface ServicePingResult {
  service: string;
  status: TelemetryNodeStatus;
  latencyMs: number;
  checkedAt: Date;
  error?: string;
}

export interface TelemetryStatusSummary {
  nodes: ServicePingResult[];
  averageLatencyMs: Record<string, number>;
  uptimePercentage: Record<string, number>;
  recentDatapoints: TelemetryMetric[];
}

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    @InjectRepository(TelemetryMetric)
    private readonly metricRepository: Repository<TelemetryMetric>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly stellarService: StellarService,
  ) {}

  async pingSystemServices(): Promise<ServicePingResult[]> {
    const results = await Promise.all([
      this.pingService('database', () => this.dataSource.query('SELECT 1')),
      this.pingService('redis', () => this.pingRedis()),
      this.pingService('stellar', () => this.stellarService.checkConnectivity()),
    ]);

    await Promise.all(
      results.map((result) =>
        this.recordMetricDatapoint({
          service: result.service,
          metricType: 'ping_latency',
          value: result.latencyMs,
          unit: 'ms',
          status: result.status,
          metadata: result.error ? { error: result.error } : undefined,
        }),
      ),
    );

    return results;
  }

  async recordMetricDatapoint(
    dto: RecordMetricDatapointDto,
  ): Promise<TelemetryMetric> {
    const datapoint = this.metricRepository.create({
      service: dto.service,
      metricType: dto.metricType ?? 'custom',
      value: dto.value,
      unit: dto.unit ?? 'ms',
      status: dto.status ?? null,
      metadata: dto.metadata ?? null,
    });
    return this.metricRepository.save(datapoint);
  }

  async fetchTelemetryStatus(): Promise<TelemetryStatusSummary> {
    const nodes = await this.pingSystemServices();

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentMetrics = await this.metricRepository
      .createQueryBuilder('metric')
      .where('metric.recordedAt >= :since', { since })
      .andWhere('metric.metricType = :metricType', {
        metricType: 'ping_latency',
      })
      .getMany();

    const averageLatencyMs: Record<string, number> = {};
    const uptimePercentage: Record<string, number> = {};

    const byService = new Map<string, TelemetryMetric[]>();
    for (const metric of recentMetrics) {
      const list = byService.get(metric.service) ?? [];
      list.push(metric);
      byService.set(metric.service, list);
    }

    for (const [service, metrics] of byService.entries()) {
      const totalLatency = metrics.reduce((sum, m) => sum + m.value, 0);
      averageLatencyMs[service] = totalLatency / metrics.length;

      const upCount = metrics.filter((m) => m.status === 'up').length;
      uptimePercentage[service] = (upCount / metrics.length) * 100;
    }

    const recentDatapoints = await this.metricRepository.find({
      order: { recordedAt: 'DESC' },
      take: 50,
    });

    return { nodes, averageLatencyMs, uptimePercentage, recentDatapoints };
  }

  private async pingService(
    service: string,
    check: () => Promise<unknown>,
  ): Promise<ServicePingResult> {
    const startedAt = Date.now();
    try {
      await check();
      return {
        service,
        status: 'up',
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date(),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Service unreachable';
      this.logger.warn(`Ping failed for ${service}: ${message}`);
      return {
        service,
        status: 'down',
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date(),
        error: message,
      };
    }
  }

  private async pingRedis(): Promise<void> {
    const redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST') ?? 'localhost',
      port: this.configService.get<number>('REDIS_PORT') ?? 6379,
      connectTimeout: 2000,
      lazyConnect: true,
    });

    try {
      await redis.connect();
      const pong = await redis.ping();
      if (pong !== 'PONG') {
        throw new Error('Redis ping did not return PONG');
      }
    } finally {
      await redis.quit().catch(() => undefined);
    }
  }
}
