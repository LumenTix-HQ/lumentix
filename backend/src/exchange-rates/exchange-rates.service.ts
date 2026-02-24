import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ExchangeRate } from './entities/exchange-rate.entity';

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);
  private readonly providerBaseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(
    @InjectRepository(ExchangeRate)
    private readonly ratesRepository: Repository<ExchangeRate>,
    private readonly config: ConfigService,
  ) {
    this.providerBaseUrl =
      this.config.get<string>('EXCHANGE_RATES_PROVIDER_BASE_URL') ?? '';
    this.apiKey = this.config.get<string>('EXCHANGE_RATES_PROVIDER_API_KEY');
  }

  /**
   * Returns the rate: 1 unit of `fromCode` = N units of `toCode`.
   * Uses a DB cache; only calls the external provider when the cached rate
   * is older than 1 hour or does not exist.
   */
  async getRate(fromCode: string, toCode: string): Promise<number> {
    if (fromCode === toCode) return 1;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const cached = await this.ratesRepository
      .createQueryBuilder('r')
      .where('r.fromCode = :from AND r.toCode = :to AND r.fetchedAt > :since', {
        from: fromCode,
        to: toCode,
        since: oneHourAgo,
      })
      .orderBy('r.fetchedAt', 'DESC')
      .getOne();

    if (cached) {
      return Number(cached.rate);
    }

    const fresh = await this.fetchFromProvider(fromCode, toCode);

    await this.ratesRepository.save(
      this.ratesRepository.create({ fromCode, toCode, rate: fresh }),
    );

    return fresh;
  }

  private async fetchFromProvider(
    fromCode: string,
    toCode: string,
  ): Promise<number> {
    if (!this.providerBaseUrl) {
      throw new NotFoundException(
        `EXCHANGE_RATES_PROVIDER_BASE_URL is not set. Cannot fetch rate for ${fromCode}→${toCode}.`,
      );
    }

    const url = new URL(`${this.providerBaseUrl}/latest`);
    url.searchParams.set('base', fromCode);
    url.searchParams.set('symbols', toCode);
    if (this.apiKey) url.searchParams.set('access_key', this.apiKey);

    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`Provider responded with HTTP ${res.status}`);
      }
      const json = (await res.json()) as { rates: Record<string, number> };
      const rate = json.rates[toCode];
      if (rate === undefined) {
        throw new Error(`Symbol ${toCode} not found in provider response`);
      }
      return rate;
    } catch (err) {
      this.logger.error(
        `Failed to fetch rate ${fromCode}→${toCode}: ${(err as Error).message}`,
      );
      throw new NotFoundException(
        `Could not retrieve exchange rate for ${fromCode}→${toCode}.`,
      );
    }
  }
}
