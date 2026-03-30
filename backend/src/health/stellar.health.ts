import { Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { StellarService } from '../stellar/stellar.service';

@Injectable()
export class StellarHealthIndicator extends HealthIndicator {
  constructor(private readonly stellarService: StellarService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.stellarService.checkConnectivity();
      return this.getStatus(key, true, {
        network: process.env.STELLAR_NETWORK ?? 'testnet',
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Stellar Horizon unreachable';

      throw new HealthCheckError(
        'Stellar check failed',
        this.getStatus(key, false, { error: message }),
      );
    }
  }
}
