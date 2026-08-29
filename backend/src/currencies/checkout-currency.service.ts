import { Injectable, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';

export interface LockedRate {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  lockedAt: Date;
  /** Rate lock expiry timestamp in ms. */
  expiresAt: number;
}

export interface ConversionResult {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  targetCurrency: string;
  rate: number;
  lockedRate?: LockedRate;
}

/** How long a locked rate is valid (10 minutes). */
const LOCK_TTL_MS = 10 * 60 * 1_000;

@Injectable()
export class CheckoutCurrencyService {
  /** In-memory rate lock store: key = `${from}:${to}:${sessionId}` */
  private readonly locks = new Map<string, LockedRate>();

  constructor(
    @Inject(forwardRef(() => ExchangeRatesService))
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  /**
   * Fetch the live exchange rate between two currency codes.
   * Delegates to the ExchangeRatesService DB-cached rate provider.
   */
  async fetch_live_exchange_rate(
    fromCurrency: string,
    toCurrency: string,
  ): Promise<number> {
    if (fromCurrency === toCurrency) return 1;
    return this.exchangeRatesService.getRate(
      fromCurrency.toUpperCase(),
      toCurrency.toUpperCase(),
    );
  }

  /**
   * Convert an amount from one currency to another.
   * Uses a locked rate when a valid `sessionId` lock exists, otherwise
   * fetches a live rate.
   */
  async convert_checkout_currency(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    sessionId?: string,
  ): Promise<ConversionResult> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero.');
    }

    let rate: number;
    let lockedRate: LockedRate | undefined;

    if (sessionId) {
      const lockKey = this.lockKey(fromCurrency, toCurrency, sessionId);
      const existingLock = this.locks.get(lockKey);
      if (existingLock && Date.now() < existingLock.expiresAt) {
        rate = existingLock.rate;
        lockedRate = existingLock;
      } else {
        // Lock expired or missing — fetch a fresh live rate
        this.locks.delete(lockKey);
        rate = await this.fetch_live_exchange_rate(fromCurrency, toCurrency);
      }
    } else {
      rate = await this.fetch_live_exchange_rate(fromCurrency, toCurrency);
    }

    return {
      originalAmount: amount,
      originalCurrency: fromCurrency.toUpperCase(),
      convertedAmount: Math.round(amount * rate * 100) / 100,
      targetCurrency: toCurrency.toUpperCase(),
      rate,
      lockedRate,
    };
  }

  /**
   * Lock the current exchange rate for a checkout session.
   * The lock is valid for `LOCK_TTL_MS` (10 minutes) to protect buyers from
   * rate fluctuations during the payment flow.
   *
   * Returns the locked rate record.
   */
  async lock_exchange_rate(
    fromCurrency: string,
    toCurrency: string,
    sessionId: string,
  ): Promise<LockedRate> {
    if (!sessionId) {
      throw new BadRequestException('sessionId is required to lock a rate.');
    }

    const rate = await this.fetch_live_exchange_rate(fromCurrency, toCurrency);
    const now = new Date();
    const lock: LockedRate = {
      fromCurrency: fromCurrency.toUpperCase(),
      toCurrency: toCurrency.toUpperCase(),
      rate,
      lockedAt: now,
      expiresAt: now.getTime() + LOCK_TTL_MS,
    };

    this.locks.set(this.lockKey(fromCurrency, toCurrency, sessionId), lock);
    return lock;
  }

  private lockKey(
    from: string,
    to: string,
    sessionId: string,
  ): string {
    return `${from.toUpperCase()}:${to.toUpperCase()}:${sessionId}`;
  }
}
