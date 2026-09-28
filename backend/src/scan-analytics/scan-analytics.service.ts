import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { ScanMetric } from './entities/scan-metric.entity';
import { RecordScanDto } from './dto/record-scan.dto';
import type { EventsService } from '../events/events.service';

export interface GateThroughputStats {
  gateId: string | null;
  scanVelocity: number;
  avgScanTimeMs: number;
  totalScans: number;
  failedScans: number;
  errorRate: number;
}

@Injectable()
export class ScanAnalyticsService {
  private readonly logger = new Logger(ScanAnalyticsService.name);
  private scanBuffer: Map<string, RecordScanDto[]> = new Map();

  constructor(
    @InjectRepository(ScanMetric)
    private readonly metricRepository: Repository<ScanMetric>,
    private readonly eventsService: EventsService,
  ) {}

  async recordScan(dto: RecordScanDto): Promise<void> {
    const key = `${dto.eventId}:${dto.gateId ?? 'default'}`;

    if (!this.scanBuffer.has(key)) {
      this.scanBuffer.set(key, []);
    }

    this.scanBuffer.get(key)!.push(dto);

    // Auto-flush if buffer reaches 10 scans
    if (this.scanBuffer.get(key)!.length >= 10) {
      await this.flushScanBuffer(key);
    }
  }

  async calculateScanVelocity(eventId: string, gateId?: string): Promise<number> {
    const oneMinuteAgo = new Date();
    oneMinuteAgo.setMinutes(oneMinuteAgo.getMinutes() - 1);

    const qb = this.metricRepository
      .createQueryBuilder('metric')
      .where('metric.eventId = :eventId', { eventId })
      .andWhere('metric.recordedAt >= :since', { since: oneMinuteAgo });

    if (gateId) {
      qb.andWhere('metric.gateId = :gateId', { gateId });
    }

    const metrics = await qb.getMany();
    if (metrics.length === 0) return 0;

    return Math.round(
      metrics.reduce((sum, m) => sum + m.scansPerMinute, 0) / metrics.length,
    );
  }

  async trackGateThroughput(
    eventId: string,
    gateId?: string,
  ): Promise<GateThroughputStats> {
    const fiveMinutesAgo = new Date();
    fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

    const qb = this.metricRepository
      .createQueryBuilder('metric')
      .where('metric.eventId = :eventId', { eventId })
      .andWhere('metric.recordedAt >= :since', { since: fiveMinutesAgo });

    if (gateId) {
      qb.andWhere('metric.gateId = :gateId', { gateId });
    }

    const metrics = await qb.getMany();

    if (metrics.length === 0) {
      return {
        gateId: gateId ?? null,
        scanVelocity: 0,
        avgScanTimeMs: 0,
        totalScans: 0,
        failedScans: 0,
        errorRate: 0,
      };
    }

    const totalScans = metrics.reduce(
      (sum, m) => sum + m.totalScansInWindow,
      0,
    );
    const failedScans = metrics.reduce((sum, m) => sum + m.failedScans, 0);
    const avgTime =
      metrics.reduce((sum, m) => sum + Number(m.avgScanTimeMs), 0) /
      metrics.length;
    const velocity = Math.round(
      metrics.reduce((sum, m) => sum + m.scansPerMinute, 0) / metrics.length,
    );

    return {
      gateId: gateId ?? null,
      scanVelocity: velocity,
      avgScanTimeMs: Number(avgTime.toFixed(2)),
      totalScans,
      failedScans,
      errorRate: Number(
        ((failedScans / (totalScans || 1)) * 100).toFixed(2),
      ),
    };
  }

  async fetchRealtimeScanSpeed(
    eventId: string,
    gateId?: string,
    minutesBack: number = 5,
  ): Promise<ScanMetric[]> {
    const cutoff = new Date();
    cutoff.setMinutes(cutoff.getMinutes() - Math.min(minutesBack, 60));

    const qb = this.metricRepository
      .createQueryBuilder('metric')
      .where('metric.eventId = :eventId', { eventId })
      .andWhere('metric.recordedAt >= :cutoff', { cutoff });

    if (gateId) {
      qb.andWhere('metric.gateId = :gateId', { gateId });
    }

    return qb.orderBy('metric.recordedAt', 'DESC').take(100).getMany();
  }

  
  // Aliases for snake_case function requirements in issue #1195
  async calculate_scan_velocity(eventId: string, gateId?: string): Promise<number> {
    return this.calculateScanVelocity(eventId, gateId);
  }

  async track_gate_throughput(
    eventId: string,
    gateId?: string,
  ): Promise<GateThroughputStats> {
    return this.trackGateThroughput(eventId, gateId);
  }

  async fetch_realtime_scan_speed(
    eventId: string,
    gateId?: string,
    minutesBack: number = 5,
  ): Promise<ScanMetric[]> {
    return this.fetchRealtimeScanSpeed(eventId, gateId, minutesBack);
  }

  async getStaffingRecommendation(
    eventId: string,
    gateId?: string,
  ): Promise<{
    eventId: string;
    gateId: string | null;
    currentVelocity: number;
    recommendedGates: number;
    queueStatus: 'low' | 'optimal' | 'congested' | 'critical';
    recommendationText: string;
  }> {
    const throughput = await this.trackGateThroughput(eventId, gateId);
    const velocity = throughput.scanVelocity;
    let recommendedGates = Math.max(1, Math.ceil(velocity / 60));
    let queueStatus: 'low' | 'optimal' | 'congested' | 'critical' = 'optimal';
    let recommendationText = 'Gate throughput is within normal operating limits.';

    if (velocity >= 150 || throughput.errorRate > 15) {
      queueStatus = 'critical';
      recommendedGates = Math.max(recommendedGates, 4);
      recommendationText = 'Critical queue congestion detected. Immediately deploy auxiliary gate staff.';
    } else if (velocity >= 90 || throughput.errorRate > 8) {
      queueStatus = 'congested';
      recommendedGates = Math.max(recommendedGates, 3);
      recommendationText = 'Elevated queue velocity. Consider opening additional scanner lanes.';
    } else if (velocity <= 15) {
      queueStatus = 'low';
      recommendedGates = 1;
      recommendationText = 'Low entry volume. 1 gate staff is sufficient.';
    }

    return {
      eventId,
      gateId: gateId ?? null,
      currentVelocity: velocity,
      recommendedGates,
      queueStatus,
      recommendationText,
    };
  }

  private async flushScanBuffer(key: string): Promise<void> {
    const scans = this.scanBuffer.get(key);
    if (!scans || scans.length === 0) return;

    const { eventId, gateId } = scans[0];
    const successfulScans = scans.filter((s) => s.success !== false);
    const failedScans = scans.length - successfulScans.length;

    const avgScanTime =
      successfulScans.length > 0
        ? successfulScans.reduce((sum, s) => sum + s.scanTimeMs, 0) /
          successfulScans.length
        : 0;

    const scansPerMinute = scans.length * 6; // Extrapolate to full minute

    const metric = this.metricRepository.create({
      eventId,
      gateId: gateId ?? null,
      scansPerMinute,
      avgScanTimeMs: avgScanTime,
      totalScansInWindow: scans.length,
      failedScans,
      errorRate: (failedScans / scans.length) * 100,
    });

    await this.metricRepository.save(metric);
    this.scanBuffer.delete(key);

    this.logger.debug(
      `Flushed ${scans.length} scans for event ${eventId} gate ${gateId || 'default'}`,
    );
  }
}
