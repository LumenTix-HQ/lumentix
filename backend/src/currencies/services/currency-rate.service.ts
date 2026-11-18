import {
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import Redis from 'ioredis';

import { REDIS_CLIENT } from '../../common/redis/redis.provider';

import {
  CURRENCY_RATE_CACHE_KEY,
  DEFAULT_RATE_TTL_SECONDS,
} from '../constant/currency.constants';

import { FxProviderService } from './fx-provider.service';

@Injectable()
export class CurrencyRateService {
  private readonly logger =
    new Logger(CurrencyRateService.name);

  constructor(
    private readonly provider: FxProviderService,
    private readonly configService: ConfigService,
    // Shared connection so currency caching inherits the same AUTH/TLS/db
    // configuration as the rest of the app (#1608).
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async getRates() {
    const cached =
      await this.redis.get(
        CURRENCY_RATE_CACHE_KEY,
      );

    if (cached) {
      return {
        data: JSON.parse(cached),
        stale: false,
      };
    }

    try {
      const rates =
        await this.provider.fetchRates();

      const ttl =
        this.configService.get<number>(
          'CURRENCY_RATE_TTL_SECONDS',
          DEFAULT_RATE_TTL_SECONDS,
        );

      await this.redis.set(
        CURRENCY_RATE_CACHE_KEY,
        JSON.stringify(rates),
        'EX',
        ttl,
      );

      return {
        data: rates,
        stale: false,
      };
    } catch (error) {
      const staleCache =
        await this.redis.get(
          `${CURRENCY_RATE_CACHE_KEY}:stale`,
        );

      if (staleCache) {
        this.logger.warn(
          'Serving stale currency rates',
        );

        return {
          data: JSON.parse(staleCache),
          stale: true,
        };
      }

      throw error;
    }
  }
}