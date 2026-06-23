import {
  Injectable,
  Logger,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import Redis from 'ioredis';

import {
  CURRENCY_RATE_CACHE_KEY,
  DEFAULT_RATE_TTL_SECONDS,
} from '../constants/currency.constants';

import { FxProviderService } from '../providers/fx-provider.service';

@Injectable()
export class CurrencyRateService {
  private readonly logger =
    new Logger(CurrencyRateService.name);

  private readonly redis: Redis;

  constructor(
    private readonly provider: FxProviderService,
    private readonly configService: ConfigService,
  ) {
    this.redis = new Redis(
      process.env.REDIS_URL,
    );
  }

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