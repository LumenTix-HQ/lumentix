import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { StellarModule } from '../stellar/stellar.module';
import { HealthController } from './health.controller';
import { StellarHealthIndicator } from './stellar.health';

@Module({
  imports: [TerminusModule, StellarModule],
  controllers: [HealthController],
  providers: [StellarHealthIndicator],
})
export class HealthModule {}
