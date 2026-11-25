import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { hostname } from 'os';
import {
  TelemetryMetric,
  MetricType,
} from './entities/telemetry-metric.entity';
import { RecordMetricDto } from './dto/record-metric.dto';

export interface TelemetryNode {
  nodeId: string;
  status: 'up' | 'down';
  lastSeenAt: Date;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  apiLatencyMs: number;
  errorRate: number;
  requestCount: number;
  requestsPerMinute: number;
  nodeStatus: 'up' | 'down';
  uptimeSeconds: number;
  nodes: TelemetryNode[];
  timestamp: Date;
}

@Injectable()
export class TelemetryService implements OnModuleInit {
  private readonly logger = new Logger(TelemetryService.name);
  private readonly nodeId = `${hostname()}-${process.pid}`;

  constructor(
    @InjectRepository(TelemetryMetric)
    private readonly metricRepository: Repository<TelemetryMetric>,
  ) {}

  onModuleInit(): void {
    void this.writeNodeHeartbeat().catch((error: unknown) => {
      this.logger.error(
        'Failed to record initial telemetry node heartbeat',
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async recordNodeHeartbeat(): Promise<void> {
    try {
      await this.writeNodeHeartbeat();
    } catch (error: unknown) {
      this.logger.error(
        'Failed to record telemetry node heartbeat',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async recordApiRequest(
    durationMs: number,
    statusCode: number,
    method: string,
    route: string,
  ): Promise<void> {
    const tags = { method, route };

    await Promise.all([
      this.recordDataPoint(MetricType.API_LATENCY, 'api', durationMs, 'ms', {
        ...tags,
        statusCode: String(statusCode),
      }),
      this.recordDataPoint(MetricType.API_LOAD, 'api', 1, 'request', tags),
      this.recordDataPoint(
        MetricType.ERROR_RATE,
        'api',
        statusCode >= 500 ? 1 : 0,
        'ratio',
        tags,
      ),
    ]);
  }

  async recordMetric(dto: RecordMetricDto): Promise<TelemetryMetric> {
    const metric = this.metricRepository.create({
      metricType: dto.metricType,
      service: dto.service,
      value: dto.value,
      unit: dto.unit ?? null,
      tags: dto.tags ?? null,
    });

    const saved = await this.metricRepository.save(metric);
    this.logger.debug(
      `Recorded ${dto.metricType} for ${dto.service}: ${dto.value}${dto.unit ?? ''}`,
    );

    return saved;
  }

  async recordDataPoint(
    metricType: MetricType,
    service: string,
    value: number,
    unit?: string,
    tags?: Record<string, string>,
  ): Promise<TelemetryMetric> {
    return this.recordMetric({
      metricType,
      service,
      value,
      unit,
      tags,
    });
  }

  private async writeNodeHeartbeat(): Promise<void> {
    await this.recordDataPoint(
      MetricType.NODE_STATUS,
      'api-node',
      1,
      'status',
      {
        status: 'up',
        nodeId: this.nodeId,
        uptimeSeconds: String(Math.floor(process.uptime())),
      },
    );
  }

  async pingSystemServices(): Promise<HealthStatus> {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const [summary, nodeMetrics] = await Promise.all([
      this.metricRepository
        .createQueryBuilder('metric')
        .select('COUNT(*)', 'sampleCount')
        .addSelect(
          `AVG(metric.value) FILTER (WHERE metric.metricType = :latencyType)`,
          'avgLatency',
        )
        .addSelect(
          `AVG(metric.value) FILTER (WHERE metric.metricType = :errorType)`,
          'avgErrorRate',
        )
        .addSelect(
          `COUNT(*) FILTER (WHERE metric.metricType = :loadType)`,
          'requestCount',
        )
        .where('metric.createdAt >= :cutoff', {
          cutoff: fiveMinutesAgo,
          latencyType: MetricType.API_LATENCY,
          errorType: MetricType.ERROR_RATE,
          loadType: MetricType.API_LOAD,
        })
        .getRawOne<{
          sampleCount: string;
          avgLatency: string | null;
          avgErrorRate: string | null;
          requestCount: string;
        }>(),
      this.metricRepository.find({
        where: {
          metricType: MetricType.NODE_STATUS,
          createdAt: MoreThanOrEqual(fiveMinutesAgo),
        },
        order: { createdAt: 'DESC' },
        take: 1000,
      }),
    ]);

    if (!summary || Number(summary.sampleCount) === 0) {
      return {
        status: 'unhealthy',
        apiLatencyMs: 0,
        errorRate: 1,
        requestCount: 0,
        requestsPerMinute: 0,
        nodeStatus: 'down',
        uptimeSeconds: Math.floor(process.uptime()),
        nodes: [],
        timestamp: now,
      };
    }

    const avgLatency = Number(summary.avgLatency ?? 0);
    const avgErrorRate = Number(summary.avgErrorRate ?? 0);
    const latestNodes = new Map<string, TelemetryMetric>();
    for (const metric of nodeMetrics) {
      const nodeId = metric.tags?.nodeId;
      if (nodeId && !latestNodes.has(nodeId)) {
        latestNodes.set(nodeId, metric);
      }
    }
    const nodes = [...latestNodes.entries()].map(([nodeId, metric]) => ({
      nodeId,
      status:
        metric.tags?.status === 'up' &&
        Number(metric.value) > 0 &&
        now.getTime() - metric.createdAt.getTime() <= 2 * 60 * 1000
          ? ('up' as const)
          : ('down' as const),
      lastSeenAt: metric.createdAt,
    }));
    const nodeStatus =
      nodes.length > 0 && nodes.every((node) => node.status === 'up')
        ? 'up'
        : 'down';
    const requestCount = Number(summary.requestCount);

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (nodeStatus === 'down' || avgLatency > 5000 || avgErrorRate > 0.1) {
      status = 'unhealthy';
    } else if (avgLatency > 1000 || avgErrorRate > 0.05) {
      status = 'degraded';
    }

    return {
      status,
      apiLatencyMs: Math.round(avgLatency),
      errorRate: Number((avgErrorRate * 100).toFixed(2)),
      requestCount,
      requestsPerMinute: Number((requestCount / 5).toFixed(2)),
      nodeStatus,
      uptimeSeconds: Math.floor(process.uptime()),
      nodes,
      timestamp: now,
    };
  }

  async fetchTelemetryStatus(
    metricType?: MetricType,
    service?: string,
    hoursBack: number = 1,
  ): Promise<TelemetryMetric[]> {
    if (!Number.isInteger(hoursBack) || hoursBack < 1 || hoursBack > 168) {
      throw new RangeError('hoursBack must be an integer between 1 and 168');
    }

    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const qb = this.metricRepository
      .createQueryBuilder('metric')
      .where('metric.createdAt >= :cutoff', { cutoff: cutoffTime });

    if (metricType) {
      qb.andWhere('metric.metricType = :metricType', { metricType });
    }

    if (service) {
      qb.andWhere('metric.service = :service', { service });
    }

    return qb.orderBy('metric.createdAt', 'DESC').take(1000).getMany();
  }

  // Alias for snake_case function requirement in issue #1414
  async record_metric_datapoint(
    metricType: MetricType,
    service: string,
    value: number,
    unit?: string,
    tags?: Record<string, string>,
  ): Promise<TelemetryMetric> {
    return this.recordDataPoint(metricType, service, value, unit, tags);
  }

  // Alias for snake_case function requirement in issue #1414
  async ping_system_services(): Promise<HealthStatus> {
    return this.pingSystemServices();
  }

  // Alias for snake_case function requirement in issue #1414
  async fetch_telemetry_status(
    metricType?: MetricType,
    service?: string,
    hoursBack: number = 1,
  ): Promise<TelemetryMetric[]> {
    return this.fetchTelemetryStatus(metricType, service, hoursBack);
  }
}
