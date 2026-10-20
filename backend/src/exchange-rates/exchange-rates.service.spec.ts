import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeRatesService } from './exchange-rates.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { ConfigService } from '@nestjs/config';

describe('ExchangeRatesService', () => {
  let service: ExchangeRatesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExchangeRatesService,
        {
          provide: getRepositoryToken(ExchangeRate),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            findOneBy: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ExchangeRatesService>(ExchangeRatesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Regression test: getRate() must use the configured
  // STALE_RATE_THRESHOLD_HOURS instead of a hardcoded 1-hour window, so it
  // agrees with the markStaleRates() cron job on what counts as stale.
  describe('getRate() staleness threshold', () => {
    async function buildService(thresholdHours: number | undefined) {
      const getOne = jest.fn().mockResolvedValue({ rate: '1.23' });
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne,
      };
      const repository = { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ExchangeRatesService,
          { provide: getRepositoryToken(ExchangeRate), useValue: repository },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) =>
                key === 'STALE_RATE_THRESHOLD_HOURS' ? thresholdHours : undefined,
              ),
            },
          },
        ],
      }).compile();

      return {
        service: module.get<ExchangeRatesService>(ExchangeRatesService),
        queryBuilder,
      };
    }

    it('uses a configured 6-hour threshold instead of the hardcoded 1 hour', async () => {
      const { service: svc, queryBuilder } = await buildService(6);

      const rate = await svc.getRate('USD', 'EUR');

      expect(rate).toBe(1.23);
      const sinceArg = (queryBuilder.where.mock.calls[0][1] as { since: Date }).since;
      const hoursAgo = (Date.now() - sinceArg.getTime()) / (60 * 60 * 1000);
      expect(hoursAgo).toBeCloseTo(6, 1);
    });

    it('falls back to the default 2-hour threshold when unset', async () => {
      const { service: svc, queryBuilder } = await buildService(undefined);

      await svc.getRate('USD', 'EUR');

      const sinceArg = (queryBuilder.where.mock.calls[0][1] as { since: Date }).since;
      const hoursAgo = (Date.now() - sinceArg.getTime()) / (60 * 60 * 1000);
      expect(hoursAgo).toBeCloseTo(2, 1);
    });
  });
});
