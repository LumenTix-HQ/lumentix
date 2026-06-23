import { Injectable, Logger } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(RedisHealthIndicator.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const redis = new Redis({
        host: this.configService.get<string>('REDIS_HOST') ?? 'localhost',
        port: this.configService.get<number>('REDIS_PORT') ?? 6379,
        connectTimeout: 2000,
        lazyConnect: true,
      });

      await redis.connect();
      const pong = await redis.ping();
      await redis.quit();

      if (pong !== 'PONG') {
        throw new Error('Redis ping did not return PONG');
      }

      return this.getStatus(key, true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Redis unreachable';
      this.logger.error(`Redis health check failed: ${message}`);
      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false, { error: message }),
      );
    }
  }
}
