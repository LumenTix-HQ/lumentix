import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { TelemetryMetric, MetricType } from './entities/telemetry-metric.entity';
import { RecordMetricDto } from './dto/record-metric.dto';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  apiLatencyMs: number;
  errorRate: number;
  timestamp: Date;
}

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    @InjectRepository(TelemetryMetric)
    private readonly metricRepository: Repository<TelemetryMetric>,
  ) {}

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

  async pingSystemServices(): Promise<HealthStatus> {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const recentMetrics = await this.metricRepository.find({
      where: {
        createdAt: MoreThanOrEqual(fiveMinutesAgo),
      },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    if (recentMetrics.length === 0) {
      return {
        status: 'unhealthy',
        apiLatencyMs: 0,
        errorRate: 1,
        timestamp: now,
      };
    }

    const latencyMetrics = recentMetrics.filter(
      (m) => m.metricType === MetricType.API_LATENCY,
    );
    const errorMetrics = recentMetrics.filter(
      (m) => m.metricType === MetricType.ERROR_RATE,
    );

    const avgLatency =
      latencyMetrics.length > 0
        ? latencyMetrics.reduce((sum, m) => sum + Number(m.value), 0) /
          latencyMetrics.length
        : 0;

    const avgErrorRate =
      errorMetrics.length > 0
        ? errorMetrics.reduce((sum, m) => sum + Number(m.value), 0) /
          errorMetrics.length
        : 0;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (avgLatency > 1000 || avgErrorRate > 0.05) {
      status = 'degraded';
    }
    if (avgLatency > 5000 || avgErrorRate > 0.1) {
      status = 'unhealthy';
    }

    return {
      status,
      apiLatencyMs: Math.round(avgLatency),
      errorRate: Number((avgErrorRate * 100).toFixed(2)),
      timestamp: now,
    };
  }

  async fetchTelemetryStatus(
    metricType?: MetricType,
    service?: string,
    hoursBack: number = 1,
  ): Promise<TelemetryMetric[]> {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - hoursBack);

    const qb = this.metricRepository
      .createQueryBuilder('metric')
      .where('metric.createdAt >= :cutoff', { cutoff: cutoffTime });

    if (metricType) {
      qb.andWhere('metric.metricType = :metricType', { metricType });
    }

    if (service) {
      qb.andWhere('metric.service = :service', { service });
    }

    return qb.orderBy('metric.createdAt', 'DESC').take(500).getMany();
  }
}
