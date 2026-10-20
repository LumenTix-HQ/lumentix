import { Global, Module } from '@nestjs/common';
import { REDIS_CLIENT, RedisProvider } from './redis.provider';

/**
 * Provides one shared ioredis connection (REDIS_CLIENT) to the whole app.
 * Global, so consumers (idempotency, brute-force, rate limiting, event cache,
 * dynamic QR, wallet, chat, throttler storage) can inject it without
 * importing a module.
 */
@Global()
@Module({
  providers: [RedisProvider],
  exports: [REDIS_CLIENT],
})
export class RedisClientModule {}
