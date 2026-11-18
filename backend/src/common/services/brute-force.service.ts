import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.provider';

@Injectable()
export class BruteForceService {
  private readonly maxAttempts: number;
  private readonly windowSeconds: number;
  private readonly lockSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis,
    private readonly configService: ConfigService,
  ) {
    this.maxAttempts = Number(
      this.configService.get<number>('MAX_ATTEMPTS', 5),
    );
    this.windowSeconds = Number(
      this.configService.get<number>('WINDOW_SECONDS', 900),
    );
    this.lockSeconds = Number(
      this.configService.get<number>('LOCK_SECONDS', 3600),
    );
  }

  private attemptsKey(ip: string): string {
    return `bruteforce:attempts:${ip}`;
  }

  private lockedKey(ip: string): string {
    return `bruteforce:locked:${ip}`;
  }

  /** Normalised key subject so "A@x.com" and "a@x.com " share one counter. */
  static accountSubject(account: string): string {
    return `account:${account.trim().toLowerCase()}`;
  }

  /**
   * Count one failed attempt for a subject (an IP, or an account via
   * `accountSubject`). INCR + EXPIRE + lock run in one MULTI so a crash
   * between them cannot leave a counter without a TTL.
   */
  async recordFailedAttempt(subject: string): Promise<void> {
    const key = this.attemptsKey(subject);
    const results = await this.redisClient
      .multi()
      .incr(key)
      .expire(key, this.windowSeconds, 'NX')
      .exec();

    const attempts = Number(results?.[0]?.[1] ?? 0);
    if (attempts >= this.maxAttempts) {
      await this.redisClient.set(
        this.lockedKey(subject),
        '1',
        'EX',
        this.lockSeconds,
      );
    }
  }

  /** Record a failure against both the account and the source IP. */
  async recordFailedLogin(account: string, ip: string): Promise<void> {
    await Promise.all([
      this.recordFailedAttempt(BruteForceService.accountSubject(account)),
      this.recordFailedAttempt(ip),
    ]);
  }

  /** Locked when either the account or the IP is locked. */
  async isLoginLocked(account: string, ip: string): Promise<boolean> {
    const [byAccount, byIp] = await Promise.all([
      this.isLocked(BruteForceService.accountSubject(account)),
      this.isLocked(ip),
    ]);
    return byAccount || byIp;
  }

  async isLocked(ip: string): Promise<boolean> {
    const value = await this.redisClient.get(this.lockedKey(ip));
    return value !== null;
  }

  async unlock(ip: string): Promise<void> {
    await this.redisClient.del(this.lockedKey(ip), this.attemptsKey(ip));
  }

  async reset(ip: string): Promise<void> {
    await this.redisClient.del(this.attemptsKey(ip));
  }
}
