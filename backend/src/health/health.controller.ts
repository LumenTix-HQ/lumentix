import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  TypeOrmHealthIndicator,
  HealthCheck,
  HealthCheckResult,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { StellarService } from '../stellar/stellar.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly stellarService: StellarService,
  ) {}

  @Get()
  @HealthCheck()
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
