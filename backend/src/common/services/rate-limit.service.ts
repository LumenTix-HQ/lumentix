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

export interface EnforceOptions {
  route?: string;
  isSensitive?: boolean;
}

export interface FallbackAlertEvent {
  timestamp: Date;
  identity: string;
  route?: string;
  allowed: boolean;
  reason: string;
}

export interface FallbackMetrics {
  totalFallbackEvents: number;
  lastFallbackAt: Date | null;
  recentAlerts: FallbackAlertEvent[];
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly windowSeconds: number;
  private readonly blockSeconds: number;
  private readonly fallbackRatio: number;
  private readonly memoryBuckets: Map<string, number[]> = new Map();
  private readonly fallbackAlerts: FallbackAlertEvent[] = [];
  private totalFallbackCount = 0;
  private lastFallbackTimestamp: Date | null = null;

  // Lua script for atomic sliding-window check-and-increment
  public static readonly ATOMIC_SLIDING_WINDOW_LUA = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local oldest = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local ttl = tonumber(ARGV[4])
    local member = ARGV[5]

    redis.call('ZREMRANGEBYSCORE', key, 0, oldest)
    local count = redis.call('ZCARD', key)
    if count < limit then
      redis.call('ZADD', key, now, member)
      redis.call('EXPIRE', key, ttl)
      return {1, count + 1}
    else
      return {0, count}
    end
  `;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {
    this.windowSeconds = Math.max(1, Number(config.get('RATE_LIMIT_WINDOW_SECONDS', 60)));
    this.blockSeconds = Math.max(1, Number(config.get('RATE_LIMIT_BLOCK_SECONDS', 900)));
    this.fallbackRatio = Math.max(0.1, Math.min(1.0, Number(config.get('RATE_LIMIT_FALLBACK_RATIO', 0.5))));
  }

  private counterKey(scope: 'ip' | 'api-key', identity: string): string {
    return `rate-limit:${scope}:${identity}`;
  }

  private blockedKey(ip: string): string {
    return `rate-limit:blocked:${ip}`;
  }

  isSensitiveRoute(route?: string): boolean {
    if (!route) return false;
    const lower = route.toLowerCase();
    return (
      lower.includes('/auth') ||
      lower.includes('/login') ||
      lower.includes('/register') ||
      lower.includes('/password') ||
      lower.includes('/payment') ||
      lower.includes('/checkout') ||
      lower.includes('/wallet') ||
      lower.includes('/qr/validate')
    );
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

  async atomic_check_and_increment(
    scope: 'ip' | 'api-key',
    identity: string,
    limit: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const key = this.counterKey(scope, identity);
    const oldest = now - this.windowSeconds * 1000;
    const ttl = this.windowSeconds + 1;
    const member = `${now}:${Math.random().toString(36).slice(2)}`;

    if (typeof this.redis.eval === 'function') {
      const result = (await this.redis.eval(
        RateLimitService.ATOMIC_SLIDING_WINDOW_LUA,
        1,
        key,
        now,
        oldest,
        limit,
        ttl,
        member,
      )) as [number, number];

      const allowed = result[0] === 1;
      const count = result[1];
      return {
        allowed,
        count,
        limit,
        retryAfterSeconds: allowed ? 0 : this.windowSeconds,
      };
    }

    // Fallback if eval is not mocked or unsupported
    const check = await this.check_rate_limit(scope, identity, limit);
    if (check.allowed) {
      const newCount = await this.increment_request_counter(scope, identity);
      return { ...check, count: newCount };
    }
    return check;
  }

  async block_abusive_ip(ip: string, seconds = this.blockSeconds): Promise<void> {
    await this.redis.set(this.blockedKey(ip), '1', 'EX', seconds);
  }

  async is_ip_blocked(ip: string): Promise<boolean> {
    return (await this.redis.exists(this.blockedKey(ip))) === 1;
  }

  getFallbackMetrics(): FallbackMetrics {
    return {
      totalFallbackEvents: this.totalFallbackCount,
      lastFallbackAt: this.lastFallbackTimestamp,
      recentAlerts: [...this.fallbackAlerts],
    };
  }

  private recordFallbackAlert(identity: string, route: string | undefined, allowed: boolean, reason: string): void {
    this.totalFallbackCount++;
    this.lastFallbackTimestamp = new Date();
    const alert: FallbackAlertEvent = {
      timestamp: this.lastFallbackTimestamp,
      identity,
      route,
      allowed,
      reason,
    };
    this.fallbackAlerts.push(alert);
    if (this.fallbackAlerts.length > 100) {
      this.fallbackAlerts.shift();
    }
    this.logger.warn(
      `[RateLimitAlert][REDIS_UNAVAILABLE] RateLimit fallback engaged: identity=${identity}, route=${route ?? 'unknown'}, allowed=${allowed}, reason=${reason}`,
    );
  }

  checkInMemoryFallback(
    scope: 'ip' | 'api-key',
    identity: string,
    limit: number,
  ): RateLimitResult {
    const now = Date.now();
    const key = `${scope}:${identity}`;
    const windowMs = this.windowSeconds * 1000;
    const oldest = now - windowMs;

    let timestamps = this.memoryBuckets.get(key) ?? [];
    timestamps = timestamps.filter((t) => t > oldest);

    const conservativeLimit = Math.max(1, Math.floor(limit * this.fallbackRatio));
    if (timestamps.length >= conservativeLimit) {
      this.memoryBuckets.set(key, timestamps);
      return {
        allowed: false,
        count: timestamps.length,
        limit: conservativeLimit,
        retryAfterSeconds: this.windowSeconds,
      };
    }

    timestamps.push(now);
    this.memoryBuckets.set(key, timestamps);

    if (this.memoryBuckets.size > 10000) {
      for (const [k, v] of this.memoryBuckets.entries()) {
        if (v.length === 0 || v[v.length - 1] <= oldest) {
          this.memoryBuckets.delete(k);
        }
      }
    }

    return {
      allowed: true,
      count: timestamps.length,
      limit: conservativeLimit,
      retryAfterSeconds: 0,
    };
  }

  async enforce(
    ip: string,
    apiKey?: string,
    options?: EnforceOptions,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const ipLimit = Math.max(1, Number(this.config.get('RATE_LIMIT_PER_IP', 100)));
    const apiKeyLimit = Math.max(1, Number(this.config.get('RATE_LIMIT_PER_API_KEY', 1000)));

    try {
      if (await this.is_ip_blocked(ip)) {
        return { allowed: false, retryAfterSeconds: this.blockSeconds };
      }

      const identities: Array<['ip' | 'api-key', string, number]> = [['ip', ip, ipLimit]];
      if (apiKey) identities.push(['api-key', apiKey, apiKeyLimit]);

      if (typeof this.redis.eval === 'function') {
        for (const [scope, identity, limit] of identities) {
          const res = await this.atomic_check_and_increment(scope, identity, limit);
          if (!res.allowed) {
            if (scope === 'ip') await this.block_abusive_ip(ip);
            return {
              allowed: false,
              retryAfterSeconds: scope === 'ip' ? this.blockSeconds : this.windowSeconds,
            };
          }
        }
        return { allowed: true, retryAfterSeconds: 0 };
      }

      const checks = await Promise.all(
        identities.map(([scope, identity, limit]) => this.check_rate_limit(scope, identity, limit)),
      );
      const failedIndex = checks.findIndex((result) => !result.allowed);
      if (failedIndex !== -1) {
        const failed = checks[failedIndex];
        if (failedIndex === 0) {
          await this.block_abusive_ip(ip);
          return { allowed: false, retryAfterSeconds: this.blockSeconds };
        }
        return { allowed: false, retryAfterSeconds: failed.retryAfterSeconds };
      }
      await Promise.all(identities.map(([scope, identity]) => this.increment_request_counter(scope, identity)));
      return { allowed: true, retryAfterSeconds: 0 };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isSensitive = options?.isSensitive ?? this.isSensitiveRoute(options?.route);

      if (isSensitive) {
        this.recordFallbackAlert(ip, options?.route, false, `Redis error on sensitive route: ${errorMsg}`);
        return { allowed: false, retryAfterSeconds: this.windowSeconds };
      }

      const fallbackResult = this.checkInMemoryFallback('ip', ip, ipLimit);
      this.recordFallbackAlert(
        ip,
        options?.route,
        fallbackResult.allowed,
        `Redis error, in-memory fallback applied (${fallbackResult.count}/${fallbackResult.limit}): ${errorMsg}`,
      );

      if (!fallbackResult.allowed) {
        return { allowed: false, retryAfterSeconds: fallbackResult.retryAfterSeconds };
      }

      if (apiKey) {
        const keyFallback = this.checkInMemoryFallback('api-key', apiKey, apiKeyLimit);
        if (!keyFallback.allowed) {
          return { allowed: false, retryAfterSeconds: keyFallback.retryAfterSeconds };
        }
      }

      return { allowed: true, retryAfterSeconds: 0 };
    }
  }
}
