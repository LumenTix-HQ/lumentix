import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { StellarService } from '../stellar/stellar.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthCheckService,
        {
          provide: TypeOrmHealthIndicator,
          useValue: {
            pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
          },
        },
        {
          provide: StellarService,
          useValue: {
            checkConnectivity: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    })
      .overrideProvider(HealthCheckService)
      .useValue({
        check: jest.fn((checks: (() => Promise<unknown>)[]) =>
          Promise.all(checks.map((c) => c())).then((results) => ({
            status: 'ok',
            info: Object.assign({}, ...results),
            error: {},
            details: Object.assign({}, ...results),
          })),
        ),
      })
      .compile();

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
  });
});
