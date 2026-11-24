import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelemetryService } from './telemetry.service';
import { TelemetryController } from './telemetry.controller';
import { TelemetryMetric } from './entities/telemetry-metric.entity';
import { TelemetryInterceptor } from './telemetry.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([TelemetryMetric])],
  providers: [
    TelemetryService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TelemetryInterceptor,
    },
  ],
  controllers: [TelemetryController],
  exports: [TelemetryService],
})
export class TelemetryModule {}
