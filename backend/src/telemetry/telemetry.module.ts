import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelemetryService } from './telemetry.service';
import { TelemetryController } from './telemetry.controller';
import { TelemetryMetric } from './entities/telemetry-metric.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TelemetryMetric])],
  providers: [TelemetryService],
  controllers: [TelemetryController],
  exports: [TelemetryService],
})
export class TelemetryModule {}
