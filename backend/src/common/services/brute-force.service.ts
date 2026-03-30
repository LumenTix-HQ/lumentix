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

  async recordFailedAttempt(ip: string): Promise<void> {
    const key = this.attemptsKey(ip);
    const attempts = await this.redisClient.incr(key);

    if (attempts === 1) {
      // first attempt starts rolling window
      await this.redisClient.expire(key, this.windowSeconds);
    }

    if (attempts >= this.maxAttempts) {
      await this.redisClient.set(
        this.lockedKey(ip),
        '1',
        'EX',
        this.lockSeconds,
      );
    }
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
