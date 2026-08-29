import { Global, Module } from '@nestjs/common';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RateLimitService } from './services/rate-limit.service';
import { RedisProvider } from './redis/redis.provider';

@Global()
@Module({
  providers: [RedisProvider, RateLimitService, RateLimitGuard],
  exports: [RateLimitService, RateLimitGuard],
})
export class RateLimitModule {}