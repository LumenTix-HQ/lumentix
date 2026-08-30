import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.provider';

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly windowSeconds: number;
  private readonly blockSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {
    this.windowSeconds = Math.max(1, Number(config.get('RATE_LIMIT_WINDOW_SECONDS', 60)));
    this.blockSeconds = Math.max(1, Number(config.get('RATE_LIMIT_BLOCK_SECONDS', 900)));
  }

  private counterKey(scope: 'ip' | 'api-key', identity: string): string {
    return `rate-limit:${scope}:${identity}`;
  }

  private blockedKey(ip: string): string {
    return `rate-limit:blocked:${ip}`;
  }

  async check_rate_limit(
    scope: 'ip' | 'api-key',
    identity: string,
    limit: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const key = this.counterKey(scope, identity);
    const oldest = now - this.windowSeconds * 1000;
    await this.redis.zremrangebyscore(key, 0, oldest);
    const count = await this.redis.zcard(key);
    return {
      allowed: count < limit,
      count,
      limit,
      retryAfterSeconds: this.windowSeconds,
    };
  }

  async increment_request_counter(
    scope: 'ip' | 'api-key',
    identity: string,
  ): Promise<number> {
    const now = Date.now();
    const key = this.counterKey(scope, identity);
    const member = `${now}:${Math.random().toString(36).slice(2)}`;
    await this.redis.zadd(key, now, member);
    await this.redis.expire(key, this.windowSeconds + 1);
    return this.redis.zcard(key);
  }

  async block_abusive_ip(ip: string, seconds = this.blockSeconds): Promise<void> {
    await this.redis.set(this.blockedKey(ip), '1', 'EX', seconds);
  }

  async is_ip_blocked(ip: string): Promise<boolean> {
    return (await this.redis.exists(this.blockedKey(ip))) === 1;
  }

  async enforce(
    ip: string,
    apiKey?: string,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const ipLimit = Math.max(1, Number(this.config.get('RATE_LIMIT_PER_IP', 100)));
    const apiKeyLimit = Math.max(1, Number(this.config.get('RATE_LIMIT_PER_API_KEY', 1000)));
    try {
      if (await this.is_ip_blocked(ip)) return { allowed: false, retryAfterSeconds: this.blockSeconds };
      const identities: Array<['ip' | 'api-key', string, number]> = [['ip', ip, ipLimit]];
      if (apiKey) identities.push(['api-key', apiKey, apiKeyLimit]);
      const checks = await Promise.all(identities.map(([scope, identity, limit]) => this.check_rate_limit(scope, identity, limit)));
      const failed = checks.find((result) => !result.allowed);
      if (failed) {
        if (failed === checks[0]) await this.block_abusive_ip(ip);
        return { allowed: false, retryAfterSeconds: failed.retryAfterSeconds };
      }
      await Promise.all(identities.map(([scope, identity]) => this.increment_request_counter(scope, identity)));
      return { allowed: true, retryAfterSeconds: 0 };
    } catch (error) {
      this.logger.warn(`Rate limiting unavailable; allowing request: ${error instanceof Error ? error.message : String(error)}`);
      return { allowed: true, retryAfterSeconds: 0 };
    }
  }
}