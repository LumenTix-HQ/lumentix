import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelemetryMetric } from './entities/telemetry-metric.entity';
import { TelemetryService } from './telemetry.service';
import { TelemetryController } from './telemetry.controller';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [TypeOrmModule.forFeature([TelemetryMetric]), StellarModule],
  controllers: [TelemetryController],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
