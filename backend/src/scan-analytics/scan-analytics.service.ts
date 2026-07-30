import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { ScanEvent } from './entities/scan-event.entity';
import { RecordGateScanDto } from './dto/record-gate-scan.dto';
import { EventsService } from '../events/events.service';

export interface ScanVelocityResult {
  eventId: string;
  gateId: string | null;
  windowMinutes: number;
  scanCount: number;
  scansPerMinute: number;
}

export interface GateThroughputStat {
  gateId: string;
  totalScans: number;
  scansInWindow: number;
  scansPerMinute: number;
}

export interface RealtimeScanSpeed {
  eventId: string;
  gateId: string | null;
  scanCount: number;
  scansPerMinute: number;
  measuredAt: Date;
}

const REALTIME_WINDOW_SECONDS = 60;

@Injectable()
export class ScanAnalyticsService {
  constructor(
    @InjectRepository(ScanEvent)
    private readonly scanEventRepository: Repository<ScanEvent>,
    private readonly eventsService: EventsService,
  ) {}

  async recordGateScan(
    eventId: string,
    dto: RecordGateScanDto,
    scannedBy?: string,
  ): Promise<ScanEvent> {
    const scan = this.scanEventRepository.create({
      eventId,
      gateId: dto.gateId,
      ticketId: dto.ticketId,
      scannedBy: scannedBy ?? null,
    });
    return this.scanEventRepository.save(scan);
  }

  async calculateScanVelocity(
    eventId: string,
    requesterId: string,
    gateId?: string,
    windowMinutes = 5,
  ): Promise<ScanVelocityResult> {
    await this.assertOrganizer(eventId, requesterId);
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const scanCount = await this.scanEventRepository.count({
      where: {
        eventId,
        ...(gateId ? { gateId } : {}),
        scannedAt: MoreThanOrEqual(since),
      },
    });

    return {
      eventId,
      gateId: gateId ?? null,
      windowMinutes,
      scanCount,
      scansPerMinute: scanCount / windowMinutes,
    };
  }

  async trackGateThroughput(
    eventId: string,
    requesterId: string,
    windowMinutes = 15,
  ): Promise<GateThroughputStat[]> {
    await this.assertOrganizer(eventId, requesterId);
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const totals = await this.scanEventRepository
      .createQueryBuilder('scan')
      .select('scan.gateId', 'gateId')
      .addSelect('COUNT(*)', 'totalScans')
      .where('scan.eventId = :eventId', { eventId })
      .groupBy('scan.gateId')
      .getRawMany<{ gateId: string; totalScans: string }>();

    const windowed = await this.scanEventRepository
      .createQueryBuilder('scan')
      .select('scan.gateId', 'gateId')
      .addSelect('COUNT(*)', 'scansInWindow')
      .where('scan.eventId = :eventId', { eventId })
      .andWhere('scan.scannedAt >= :since', { since })
      .groupBy('scan.gateId')
      .getRawMany<{ gateId: string; scansInWindow: string }>();

    const windowedByGate = new Map(
      windowed.map((row) => [row.gateId, Number(row.scansInWindow)]),
    );

    return totals
      .map((row) => {
        const scansInWindow = windowedByGate.get(row.gateId) ?? 0;
        return {
          gateId: row.gateId,
          totalScans: Number(row.totalScans),
          scansInWindow,
          scansPerMinute: scansInWindow / windowMinutes,
        };
      })
      .sort((a, b) => b.scansPerMinute - a.scansPerMinute);
  }

  async fetchRealtimeScanSpeed(
    eventId: string,
    requesterId: string,
    gateId?: string,
  ): Promise<RealtimeScanSpeed> {
    await this.assertOrganizer(eventId, requesterId);
    const since = new Date(Date.now() - REALTIME_WINDOW_SECONDS * 1000);

    const scanCount = await this.scanEventRepository.count({
      where: {
        eventId,
        ...(gateId ? { gateId } : {}),
        scannedAt: MoreThanOrEqual(since),
      },
    });

    return {
      eventId,
      gateId: gateId ?? null,
      scanCount,
      scansPerMinute: scanCount * (60 / REALTIME_WINDOW_SECONDS),
      measuredAt: new Date(),
    };
  }

  private async assertOrganizer(eventId: string, requesterId: string): Promise<void> {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== requesterId) {
      throw new ForbiddenException('Only the event organizer can view gate scan analytics');
    }
  }
}
