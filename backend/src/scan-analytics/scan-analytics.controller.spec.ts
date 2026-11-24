import { ScanAnalyticsController } from './scan-analytics.controller';

describe('ScanAnalyticsController', () => {
  let controller: ScanAnalyticsController;
  let mockScanService: any;

  const eventId = 'event-200';
  const gateId = 'gate-1';
  const req = { user: { id: 'user-1' } } as any;

  beforeEach(() => {
    mockScanService = {
      recordScan: jest.fn().mockResolvedValue(undefined),
      calculateScanVelocity: jest.fn().mockResolvedValue(45),
      trackGateThroughput: jest.fn().mockResolvedValue({
        gateId,
        scanVelocity: 45,
        avgScanTimeMs: 350,
        totalScans: 20,
        failedScans: 1,
        errorRate: 5,
      }),
      fetchRealtimeScanSpeed: jest.fn().mockResolvedValue([
        { id: 'm-1', scansPerMinute: 45 },
      ]),
      getStaffingRecommendation: jest.fn().mockResolvedValue({
        eventId,
        gateId,
        currentVelocity: 45,
        recommendedGates: 1,
        queueStatus: 'optimal',
        recommendationText: 'Normal throughput',
      }),
    };

    controller = new ScanAnalyticsController(mockScanService);
  });

  it('records a ticket scan', async () => {
    const dto = { eventId, gateId, ticketId: 'tick-1', scanTimeMs: 300, success: true };
    await controller.recordScan(eventId, dto, req);
    expect(mockScanService.recordScan).toHaveBeenCalledWith(dto);
  });

  it('calculates scan velocity', async () => {
    const res = await controller.getScanVelocity(eventId, gateId);
    expect(res).toEqual({ eventId, gateId, scansPerMinute: 45 });
    expect(mockScanService.calculateScanVelocity).toHaveBeenCalledWith(eventId, gateId);
  });

  it('tracks gate throughput', async () => {
    const res = await controller.getGateThroughput(eventId, gateId);
    expect(res.scanVelocity).toBe(45);
    expect(mockScanService.trackGateThroughput).toHaveBeenCalledWith(eventId, gateId);
  });

  it('fetches realtime scan speed', async () => {
    const res = await controller.getRealtimeScanSpeed(eventId, gateId, 10);
    expect(res).toHaveLength(1);
    expect(mockScanService.fetchRealtimeScanSpeed).toHaveBeenCalledWith(eventId, gateId, 10);
  });

  it('fetches staffing recommendations', async () => {
    const res = await controller.getStaffingRecommendation(eventId, gateId);
    expect(res.recommendedGates).toBe(1);
    expect(mockScanService.getStaffingRecommendation).toHaveBeenCalledWith(eventId, gateId);
  });
});
