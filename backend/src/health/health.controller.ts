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

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly stellar: StellarHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @SkipThrottle()
  @ApiOperation({
    summary: 'Liveness check',
    description:
      'Public. Checks internal services status (DB, Stellar connectivity).',
  })
  @ApiResponse({ status: 200, description: 'All systems operational' })
  @ApiResponse({ status: 503, description: 'Service unavailable' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 3000 }),
      () => this.stellar.isHealthy('stellar'),
    ]);
  }
}
