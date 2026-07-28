import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Currency } from './entities/currency.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
// ...existing code...
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
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
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

  async findActiveCodes(): Promise<string[]> {
    const records = await this.currencyRepository.find({
      where: { isActive: true },
      select: ['code'],
    });
    return records.map((c) => c.code);
  }

  async toggleActive(id: string): Promise<Currency> {
    const currency = await this.currencyRepository.findOne({ where: { id } });
    if (!currency) throw new NotFoundException();
    currency.isActive = !currency.isActive;
    return await this.currencyRepository.save(currency);
  }

  async activate(code: string): Promise<Currency> {
    const currency = await this.currencyRepository.findOne({ where: { code } });
    if (!currency) throw new NotFoundException(`Currency "${code}" not found.`);
    if (currency.isActive) return currency;
    currency.isActive = true;
    return this.currencyRepository.save(currency);
  }

  async deactivate(code: string): Promise<Currency> {
    const currency = await this.currencyRepository.findOne({ where: { code } });
    if (!currency) throw new NotFoundException(`Currency "${code}" not found.`);

    const pendingCount = await this.paymentRepository.count({
      where: { currency: code, status: PaymentStatus.PENDING },
    });
    if (pendingCount > 0) {
      throw new ConflictException(
        `Cannot deactivate "${code}": ${pendingCount} pending payment(s) are still using this currency.`,
      );
    }

    if (!currency.isActive) return currency;
    currency.isActive = false;
    return this.currencyRepository.save(currency);
  }
  async create(createCurrencyDto: Partial<Currency>): Promise<Currency> {
    const currency = this.currencyRepository.create(createCurrencyDto);
    return await this.currencyRepository.save(currency);
  }

  async findAll(): Promise<Currency[]> {
    return await this.currencyRepository.find();
  }

  async findOne(id: string): Promise<Currency | undefined> {
    const result = await this.currencyRepository.findOne({ where: { id } });
    return result ?? undefined;
  }

  async update(
    id: string,
    updateCurrencyDto: Partial<Currency>,
  ): Promise<Currency | undefined> {
    await this.currencyRepository.update(id, updateCurrencyDto);
    return await this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.currencyRepository.delete(id);
  }
}
