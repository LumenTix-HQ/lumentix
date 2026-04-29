import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { RatesRefreshJob } from './rates-refresh.job';
import { ExchangeRatesService } from '../exchange-rates.service';
import { CurrenciesService } from '../../currencies/currencies.service';
import { ExchangeRate } from '../entities/exchange-rate.entity';

describe('RatesRefreshJob', () => {
    let job: RatesRefreshJob;
    let ratesService: ExchangeRatesService;
    let currenciesService: CurrenciesService;
    let ratesRepo: any;

    const mockRatesRepo = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RatesRefreshJob,
                {
                    provide: ExchangeRatesService,
                    useValue: {
                        getRate: jest.fn().mockResolvedValue(1.23),
                    },
                },
                {
                    provide: CurrenciesService,
                    useValue: {
                        findActiveCodes: jest.fn().mockResolvedValue(['XLM', 'USDC']),
                    },
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn().mockReturnValue(2),
                    },
                },
                {
                    provide: getRepositoryToken(ExchangeRate),
                    useValue: mockRatesRepo,
                },
            ],
        }).compile();

        job = module.get<RatesRefreshJob>(RatesRefreshJob);
        ratesService = module.get<ExchangeRatesService>(ExchangeRatesService);
        currenciesService = module.get<CurrenciesService>(CurrenciesService);
        ratesRepo = module.get(getRepositoryToken(ExchangeRate));
    });

    it('should be defined', () => {
        expect(job).toBeDefined();
    });

    describe('refreshRates', () => {
        it('should refresh all active currency pairs', async () => {
            await job.refreshRates();

            expect(currenciesService.findActiveCodes).toHaveBeenCalled();
            // pairs for ['XLM', 'USDC'] are (XLM, USDC) and (USDC, XLM)
            expect(ratesService.getRate).toHaveBeenCalledTimes(2);
            expect(ratesService.getRate).toHaveBeenCalledWith('XLM', 'USDC');
            expect(ratesService.getRate).toHaveBeenCalledWith('USDC', 'XLM');
        });

        it('should handle failures for individual pairs without aborting', async () => {
            jest.spyOn(ratesService, 'getRate')
                .mockRejectedValueOnce(new Error('API Error'))
                .mockResolvedValueOnce(1.23);

            await job.refreshRates();

            expect(ratesService.getRate).toHaveBeenCalledTimes(2);
        });

        it('should check for stale rates after refresh', async () => {
            const staleRate = { fromCode: 'XLM', toCode: 'USDC', fetchedAt: new Date(0) };
            mockRatesRepo.getMany.mockResolvedValueOnce([staleRate]);

            await job.refreshRates();

            expect(ratesRepo.createQueryBuilder).toHaveBeenCalled();
            expect(mockRatesRepo.where).toHaveBeenCalledWith(
                'r.fetchedAt < :threshold',
                expect.objectContaining({ threshold: expect.any(Date) }),
            );
        });
    });
});
