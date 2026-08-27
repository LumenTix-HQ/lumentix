import { Injectable, Logger } from '@nestjs/common';

const CACHE_TTL_MS = 5 * 60 * 1_000;
const FX_PROVIDER_URL =
  process.env.FX_PROVIDER_URL ??
  'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd,eur,gbp,ngn';
const FX_PROVIDER_TIMEOUT_MS = Number(process.env.FX_PROVIDER_TIMEOUT_MS ?? 5000);

@Injectable()
export class FxProviderService {
  private readonly logger = new Logger(FxProviderService.name);

  private cachedRates: Record<string, number> | null = null;
  private cacheTimestamp = 0;

  async fetchRates(): Promise<{
    base: string;
    timestamp: string;
    rates: Record<string, number>;
    stale?: boolean;
  }> {
    const now = Date.now();
    const cacheValid = this.cachedRates && now - this.cacheTimestamp < CACHE_TTL_MS;

    if (cacheValid) {
      return {
        base: 'XLM',
        timestamp: new Date(this.cacheTimestamp).toISOString(),
        rates: this.cachedRates!,
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FX_PROVIDER_TIMEOUT_MS);

      const response = await fetch(FX_PROVIDER_URL, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`FX Provider API responded with status ${response.status}`);
      }

      const data = (await response.json()) as {
        stellar?: Record<string, number>;
        rates?: Record<string, number>;
      };

      const rawRates = data.stellar ?? data.rates ?? { usd: 0.23, eur: 0.21, gbp: 0.18, ngn: 350 };
      const rates: Record<string, number> = {
        USD: rawRates.usd ?? 0.23,
        EUR: rawRates.eur ?? 0.21,
        GBP: rawRates.gbp ?? 0.18,
        NGN: rawRates.ngn ?? 350,
      };

      this.cachedRates = rates;
      this.cacheTimestamp = now;

      return {
        base: 'XLM',
        timestamp: new Date(now).toISOString(),
        rates,
      };
    } catch (err) {
      this.logger.error('Failed to fetch FX rates from CoinGecko API', err);

      if (this.cachedRates) {
        this.logger.warn('Falling back to stale cached FX rates');
        return {
          base: 'XLM',
          timestamp: new Date(this.cacheTimestamp).toISOString(),
          rates: this.cachedRates,
          stale: true,
        };
      }

      return {
        base: 'XLM',
        timestamp: new Date(now).toISOString(),
        rates: { USD: 0.23, EUR: 0.21, GBP: 0.18, NGN: 350 },
        stale: true,
      };
    }
  }
}
