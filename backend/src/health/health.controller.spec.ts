import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthCheckResult,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { StellarHealthIndicator } from './stellar.health';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: { check: jest.Mock };
  let dbIndicator: { pingCheck: jest.Mock };
  let stellarIndicator: { isHealthy: jest.Mock };

  beforeEach(async () => {
    healthCheckService = {
      check: jest.fn((checks: (() => Promise<unknown>)[]) =>
        Promise.all(checks.map((c) => c())).then((results) => {
          const details = results.reduce<Record<string, unknown>>(
            (acc, result) => ({
              ...acc,
              ...(result as Record<string, unknown>),
            }),
            {},
          );

          return {
            status: 'ok',
            info: details,
            error: {},
            details,
          } as HealthCheckResult;
        }),
      ),
    };

    dbIndicator = {
      pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
    };

    stellarIndicator = {
      isHealthy: jest.fn().mockResolvedValue({
        stellar: { status: 'up', network: 'testnet' },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: healthCheckService,
        },
        {
          provide: TypeOrmHealthIndicator,
          useValue: dbIndicator,
        },
        {
          provide: StellarHealthIndicator,
          useValue: stellarIndicator,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('when healthy returns result with status ok and database + stellar up', async () => {
    const result = await controller.check();
    expect(result.status).toBe('ok');
    expect(result.info).toBeDefined();
    expect(result.info?.database?.status).toBe('up');
    expect(result.info?.stellar?.status).toBe('up');
    expect(result.info?.stellar?.network).toBe('testnet');
    expect(dbIndicator.pingCheck).toHaveBeenCalledWith('database', {
      timeout: 3000,
    });
    expect(stellarIndicator.isHealthy).toHaveBeenCalledWith('stellar');
  });
});
