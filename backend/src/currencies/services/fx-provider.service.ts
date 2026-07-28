import { Injectable, Logger } from '@nestjs/common';

const CACHE_TTL_MS = 5 * 60 * 1_000;
const FX_API_URL =
  process.env.FX_API_URL ?? 'https://api.exchangerate-api.com/v4/latest/USD';

@Injectable()
export class FxProviderService {
  private readonly logger = new Logger(FxProviderService.name);

  private cachedRates: Record<string, number> | null = null;
  private cacheTimestamp = 0;

  async fetchRates(): Promise<{
    base: string;
    timestamp: string;
    rates: Record<string, number>;
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
      const response = await fetch(FX_API_URL);
      if (!response.ok) {
        throw new Error(`FX API responded with status ${response.status}`);
      }

      const data = (await response.json()) as {
        base: string;
        rates: Record<string, number>;
      };

      const usdToXlm = data.rates?.XLM;
      if (!usdToXlm || typeof usdToXlm !== 'number' || usdToXlm <= 0) {
        throw new Error('FX API response missing or invalid XLM rate');
      }

      const rates: Record<string, number> = {};
      for (const [currency, usdRate] of Object.entries(data.rates)) {
        if (typeof usdRate === 'number' && usdRate > 0) {
          rates[currency] = usdRate / usdToXlm;
        }
      }

      this.cachedRates = rates;
      this.cacheTimestamp = now;

      return {
        base: 'XLM',
        timestamp: new Date(now).toISOString(),
        rates,
      };
    } catch (err) {
      this.logger.error('Failed to fetch FX rates from API', err);

      if (this.cachedRates) {
        this.logger.warn('Falling back to cached FX rates');
        return {
          base: 'XLM',
          timestamp: new Date(this.cacheTimestamp).toISOString(),
          rates: this.cachedRates,
        };
      }

      return {
        base: 'XLM',
        timestamp: new Date(now).toISOString(),
        rates: { USD: 0.23, EUR: 0.21, GBP: 0.18 },
      };
    }
  }
}
