import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.provider';

@Injectable()
export class EventCacheService {
  private readonly logger = new Logger(EventCacheService.name);
  private readonly DEFAULT_TTL = 300; // 5 minutes

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async cacheEventMetadata(
    eventId: string,
    data: any,
    ttl: number = this.DEFAULT_TTL,
  ): Promise<void> {
    try {
      const key = `event:metadata:${eventId}`;
      await this.redis.set(key, JSON.stringify(data), 'EX', ttl);
      this.logger.debug(`Cached event metadata for ${eventId}`);
    } catch (error) {
      this.logger.warn(`Failed to cache event metadata: ${error.message}`);
    }
  }

  async invalidateCacheEntry(eventId: string): Promise<void> {
    try {
      const key = `event:metadata:${eventId}`;
      await this.redis.del(key);
      this.logger.debug(`Invalidated cache for event ${eventId}`);
    } catch (error) {
      this.logger.warn(`Failed to invalidate cache: ${error.message}`);
    }
  }

  async fetchCachedMetadata(eventId: string): Promise<any | null> {
    try {
      const key = `event:metadata:${eventId}`;
      const cached = await this.redis.get(key);
      if (cached) {
        this.logger.debug(`Cache hit for event ${eventId}`);
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      this.logger.warn(`Failed to fetch cached metadata: ${error.message}`);
      return null;
    }
  }
}
