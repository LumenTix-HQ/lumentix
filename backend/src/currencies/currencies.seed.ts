import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency } from './entities/currency.entity';

export const DEFAULT_CURRENCIES = [
  { code: 'XLM', displayName: 'Stellar Lumens', symbol: 'XLM', isActive: true },
  { code: 'USDC', displayName: 'USD Coin', symbol: 'USDC', isActive: true },
  { code: 'USD', displayName: 'US Dollar', symbol: '$', isActive: true },
  { code: 'NGN', displayName: 'Nigerian Naira', symbol: '₦', isActive: true },
  { code: 'EUR', displayName: 'Euro', symbol: '€', isActive: true },
];

@Injectable()
export class CurrenciesSeeder implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(Currency)
    private readonly repo: Repository<Currency>,
  ) {}

  async onApplicationBootstrap() {
    for (const c of DEFAULT_CURRENCIES) {
      const exists = await this.repo.findOne({ where: { code: c.code } });
      if (!exists) {
        await this.repo.save(this.repo.create(c));
      }
    }
  }
}
