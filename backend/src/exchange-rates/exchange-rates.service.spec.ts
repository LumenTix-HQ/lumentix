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
});
