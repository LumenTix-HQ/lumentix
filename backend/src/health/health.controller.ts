import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  HealthCheckService,
  TypeOrmHealthIndicator,
  HealthCheck,
  HealthCheckResult,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { StellarService } from '../stellar/stellar.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly stellarService: StellarService,
  ) {}

  @Get()
  @HealthCheck()
  @SkipThrottle()
  @ApiOperation({ summary: 'Liveness check', description: 'Public. Checks internal services status (DB, Stellar connectivity).' })
  @ApiResponse({ status: 200, description: 'All systems operational' })
  @ApiResponse({ status: 503, description: 'Service unavailable' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 3000 }),
      () => this.checkStellar(),
    ]);
  }

  private async checkStellar(): Promise<HealthIndicatorResult> {
    try {
      await this.stellarService.checkConnectivity();
      return { stellar: { status: 'up' } };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Stellar Horizon unreachable';
      throw new HealthCheckError('Stellar check failed', {
        stellar: { status: 'down', message },
      });
    }
  }
}
