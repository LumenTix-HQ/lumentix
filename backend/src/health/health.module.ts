import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { StellarModule } from '../stellar/stellar.module';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule, StellarModule],
  controllers: [HealthController],
})
export class HealthModule {}
