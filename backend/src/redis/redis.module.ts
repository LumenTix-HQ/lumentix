import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import KeyvRedis from '@keyv/redis';
import { buildRedisUrl } from '../common/redis/redis-options';

@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        // Same AUTH/TLS/db configuration as REDIS_CLIENT and BullMQ (#1608).
        // KeyvRedis uses node-redis, so it takes a URL rather than ioredis options.
        return { stores: [new KeyvRedis(buildRedisUrl(configService))] };
      },
    }),
  ],
  exports: [CacheModule],
})
export class RedisModule {}
