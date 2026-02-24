import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Currency } from './entities/currency.entity';

export interface CurrencyMeta {
  code: string;
  symbol: string;
  displayName: string;
}

@Injectable()
export class CurrenciesService {
  constructor(
    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,
  ) {}

  /**
   * Bulk-fetch metadata for a list of currency codes in one query.
   * Returns a map of code → CurrencyMeta for O(1) lookups in callers.
   * Codes not found in the table are omitted — callers fall back to the raw code.
   */
  async findByCodes(codes: string[]): Promise<Record<string, CurrencyMeta>> {
    if (codes.length === 0) return {};

    const records = await this.currencyRepository.find({
      where: { code: In(codes), isActive: true },
    });

    return Object.fromEntries(
      records.map((c) => [
        c.code,
        { code: c.code, symbol: c.symbol, displayName: c.displayName },
      ]),
    );
  }
}
