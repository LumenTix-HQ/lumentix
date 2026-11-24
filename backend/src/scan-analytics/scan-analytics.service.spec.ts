import { ScanAnalyticsService } from './scan-analytics.service';

describe('ScanAnalyticsService', () => {
  let service: ScanAnalyticsService;
  let mockMetricRepo: any;
  let mockEventsService: any;
  let mockQueryBuilder: any;

  const eventId = 'event-100';
  const gateId = 'gate-A';

  beforeEach(() => {
    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    mockMetricRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      create: jest.fn().mockImplementation((val) => ({ id: 'metric-1', ...val })),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
    };

    mockEventsService = {
      getEventById: jest.fn().mockResolvedValue({ id: eventId }),
    };

    service = new ScanAnalyticsService(mockMetricRepo, mockEventsService);
  });

  describe('calculate_scan_velocity / calculateScanVelocity', () => {
    it('returns 0 when no metrics are found in the time window', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      const velocity = await service.calculate_scan_velocity(eventId, gateId);
      expect(velocity).toBe(0);
    });

    it('calculates average scans per minute across recent metrics', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([
        { scansPerMinute: 60 },
        { scansPerMinute: 90 },
        { scansPerMinute: 120 },
      ]);

      const velocity = await service.calculateScanVelocity(eventId);
      expect(velocity).toBe(90);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('metric.eventId = :eventId', {
        eventId,
      });
    });
  });

  describe('track_gate_throughput / trackGateThroughput', () => {
    it('returns zeroed stats when no metrics are recorded in 5 minute window', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      const stats = await service.track_gate_throughput(eventId, gateId);
      expect(stats).toEqual({
        gateId,
        scanVelocity: 0,
        avgScanTimeMs: 0,
        totalScans: 0,
        failedScans: 0,
        errorRate: 0,
      });
    });

    it('aggregates throughput stats, error rate and velocity accurately', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([
        {
          totalScansInWindow: 20,
          failedScans: 2,
          avgScanTimeMs: 400,
          scansPerMinute: 60,
        },
        {
          totalScansInWindow: 30,
          failedScans: 3,
          avgScanTimeMs: 500,
          scansPerMinute: 80,
        },
      ]);

      const stats = await service.trackGateThroughput(eventId, gateId);
      expect(stats.totalScans).toBe(50);
      expect(stats.failedScans).toBe(5);
      expect(stats.errorRate).toBe(10); // 5 / 50 * 100%
      expect(stats.avgScanTimeMs).toBe(450);
      expect(stats.scanVelocity).toBe(70);
    });
  });

  describe('fetch_realtime_scan_speed / fetchRealtimeScanSpeed', () => {
    it('fetches ordered scan metrics for dashboard within specified window', async () => {
      const mockMetrics = [
        { id: 'm-1', scansPerMinute: 75, recordedAt: new Date() },
      ];
      mockQueryBuilder.getMany.mockResolvedValue(mockMetrics);

      const res = await service.fetch_realtime_scan_speed(eventId, gateId, 10);
      expect(res).toEqual(mockMetrics);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(100);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('metric.recordedAt', 'DESC');
    });
  });

  describe('Staffing recommendations', () => {
    it('recommends optimal staffing under normal velocity', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([
        { totalScansInWindow: 40, failedScans: 1, avgScanTimeMs: 300, scansPerMinute: 50 },
      ]);

      const rec = await service.getStaffingRecommendation(eventId, gateId);
      expect(rec.queueStatus).toBe('optimal');
      expect(rec.recommendedGates).toBe(1);
    });

    it('recommends critical alert and extra gates under congested velocity', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([
        { totalScansInWindow: 100, failedScans: 20, avgScanTimeMs: 800, scansPerMinute: 160 },
      ]);

      const rec = await service.getStaffingRecommendation(eventId, gateId);
      expect(rec.queueStatus).toBe('critical');
      expect(rec.recommendedGates).toBeGreaterThanOrEqual(3);
    });
  });

  describe('recordScan & buffer flushing', () => {
    it('buffers scans and auto-flushes when 10 scans are recorded', async () => {
      for (let i = 0; i < 10; i++) {
        await service.recordScan({
          eventId,
          gateId,
          ticketId: 't-' + i,
          scanTimeMs: 300,
          success: true,
        });
      }

      expect(mockMetricRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId,
          gateId,
          totalScansInWindow: 10,
          failedScans: 0,
        }),
      );
      expect(mockMetricRepo.save).toHaveBeenCalled();
    });
  });
});
