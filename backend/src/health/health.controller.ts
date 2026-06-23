import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  HealthCheckService,
  TypeOrmHealthIndicator,
  HealthCheck,
  HealthCheckResult,
} from '@nestjs/terminus';
import { StellarHealthIndicator } from './stellar.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { SmtpHealthIndicator } from './indicators/smtp.health';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly stellar: StellarHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly smtp: SmtpHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @SkipThrottle()
  @ApiOperation({
    summary: 'Comprehensive health check',
    description:
      'Public. Checks DB, Redis, Stellar (Horizon), and SMTP connectivity.',
  })
  @ApiResponse({ status: 200, description: 'All systems operational' })
  @ApiResponse({ status: 503, description: 'Service unavailable' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 3000 }),
      () => this.redis.isHealthy('redis'),
      () => this.stellar.isHealthy('stellar'),
      () => this.smtp.isHealthy('smtp'),
    ]);
  }
}
