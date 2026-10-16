import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelemetryService } from './telemetry.service';
import { TelemetryMetric, MetricType } from './entities/telemetry-metric.entity';

describe('TelemetryService', () => {
  let service: TelemetryService;
  let repository: jest.Mocked<Repository<TelemetryMetric>>;

  const mockMetric: TelemetryMetric = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    metricType: MetricType.API_LATENCY,
    service: 'api-gateway',
    value: 120,
    unit: 'ms',
    tags: { route: '/events' },
    createdAt: new Date(),
  };

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([mockMetric]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetryService,
        {
          provide: getRepositoryToken(TelemetryMetric),
          useValue: {
            create: jest.fn().mockImplementation((dto) => ({ ...dto, id: 'metric-id', createdAt: new Date() })),
            save: jest.fn().mockImplementation((metric) => Promise.resolve({ ...metric, id: 'metric-id' })),
            find: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
      ],
    }).compile();

    service = module.get<TelemetryService>(TelemetryService);
    repository = module.get(getRepositoryToken(TelemetryMetric));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordMetric and recordDataPoint', () => {
    it('should record a metric successfully', async () => {
      const result = await service.recordMetric({
        metricType: MetricType.API_LATENCY,
        service: 'api-gateway',
        value: 150,
        unit: 'ms',
      });

      expect(repository.create).toHaveBeenCalledWith({
        metricType: MetricType.API_LATENCY,
        service: 'api-gateway',
        value: 150,
        unit: 'ms',
        tags: null,
      });
      expect(repository.save).toHaveBeenCalled();
      expect(result.value).toBe(150);
    });

    it('should record metric via record_metric_datapoint alias', async () => {
      const result = await service.record_metric_datapoint(
        MetricType.ERROR_RATE,
        'order-service',
        0.02,
        '%',
        { env: 'production' },
      );

      expect(repository.create).toHaveBeenCalledWith({
        metricType: MetricType.ERROR_RATE,
        service: 'order-service',
        value: 0.02,
        unit: '%',
        tags: { env: 'production' },
      });
      expect(result.value).toBe(0.02);
    });
  });

  describe('pingSystemServices and ping_system_services', () => {
    it('should return unhealthy when no recent metrics exist', async () => {
      (repository.find as jest.Mock).mockResolvedValueOnce([]);

      const health = await service.ping_system_services();

      expect(health.status).toBe('unhealthy');
      expect(health.errorRate).toBe(1);
      expect(health.apiLatencyMs).toBe(0);
    });

    it('should return healthy when latency and error rate are within thresholds', async () => {
      const recentMetrics = [
        {
          id: '1',
          metricType: MetricType.API_LATENCY,
          service: 'api',
          value: 150,
          createdAt: new Date(),
        },
        {
          id: '2',
          metricType: MetricType.ERROR_RATE,
          service: 'api',
          value: 0.01,
          createdAt: new Date(),
        },
      ] as TelemetryMetric[];

      (repository.find as jest.Mock).mockResolvedValueOnce(recentMetrics);

      const health = await service.ping_system_services();

      expect(health.status).toBe('healthy');
      expect(health.apiLatencyMs).toBe(150);
      expect(health.errorRate).toBe(1);
    });

    it('should return degraded when latency exceeds 1000ms', async () => {
      const recentMetrics = [
        {
          id: '1',
          metricType: MetricType.API_LATENCY,
          service: 'api',
          value: 1200,
          createdAt: new Date(),
        },
      ] as TelemetryMetric[];

      (repository.find as jest.Mock).mockResolvedValueOnce(recentMetrics);

      const health = await service.pingSystemServices();

      expect(health.status).toBe('degraded');
      expect(health.apiLatencyMs).toBe(1200);
    });

    it('should return unhealthy when latency exceeds 5000ms', async () => {
      const recentMetrics = [
        {
          id: '1',
          metricType: MetricType.API_LATENCY,
          service: 'api',
          value: 6000,
          createdAt: new Date(),
        },
      ] as TelemetryMetric[];

      (repository.find as jest.Mock).mockResolvedValueOnce(recentMetrics);

      const health = await service.ping_system_services();

      expect(health.status).toBe('unhealthy');
      expect(health.apiLatencyMs).toBe(6000);
    });
  });

  describe('fetchTelemetryStatus and fetch_telemetry_status', () => {
    it('should query metrics with filters via alias', async () => {
      const results = await service.fetch_telemetry_status(
        MetricType.API_LATENCY,
        'auth-service',
        2,
      );

      expect(mockQueryBuilder.where).toHaveBeenCalled();
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'metric.metricType = :metricType',
        { metricType: MetricType.API_LATENCY },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'metric.service = :service',
        { service: 'auth-service' },
      );
      expect(results).toEqual([mockMetric]);
    });
  });
});
