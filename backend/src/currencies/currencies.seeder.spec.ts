import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrenciesSeeder, DEFAULT_CURRENCIES } from './currencies.seeder';
import { Currency } from './entities/currency.entity';

describe('CurrenciesSeeder', () => {
  let seeder: CurrenciesSeeder;
  let repo: Repository<Currency>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrenciesSeeder,
        {
          provide: getRepositoryToken(Currency),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    seeder = module.get<CurrenciesSeeder>(CurrenciesSeeder);
    repo = module.get<Repository<Currency>>(getRepositoryToken(Currency));
  });

  it('should be defined', () => {
    expect(seeder).toBeDefined();
  });

  it('should seed currencies if they do not exist', async () => {
    jest.spyOn(repo, 'findOne').mockResolvedValue(null);
    jest.spyOn(repo, 'create').mockImplementation((entity) => entity as any);

    await seeder.onApplicationBootstrap();

    expect(repo.findOne).toHaveBeenCalledTimes(DEFAULT_CURRENCIES.length);
    expect(repo.create).toHaveBeenCalledTimes(DEFAULT_CURRENCIES.length);
    expect(repo.save).toHaveBeenCalledTimes(DEFAULT_CURRENCIES.length);
  });

  it('should skip seeding existing currencies', async () => {
    // Mock that the first currency exists, but others do not
    jest.spyOn(repo, 'findOne').mockImplementation(async ({ where }: any) => {
      if (where.code === DEFAULT_CURRENCIES[0].code) {
        return { id: '1', ...DEFAULT_CURRENCIES[0] } as Currency;
      }
      return null;
    });
    jest.spyOn(repo, 'create').mockImplementation((entity) => entity as any);

    await seeder.onApplicationBootstrap();

    expect(repo.findOne).toHaveBeenCalledTimes(DEFAULT_CURRENCIES.length);
    // Should create/save for all EXCEPT the first one
    expect(repo.create).toHaveBeenCalledTimes(DEFAULT_CURRENCIES.length - 1);
    expect(repo.save).toHaveBeenCalledTimes(DEFAULT_CURRENCIES.length - 1);
  });

  it('should skip seeding entirely if all currencies exist', async () => {
    jest.spyOn(repo, 'findOne').mockResolvedValue({ id: '1', code: 'ANY' } as Currency);

    await seeder.onApplicationBootstrap();

    expect(repo.findOne).toHaveBeenCalledTimes(DEFAULT_CURRENCIES.length);
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
