import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScanAnalyticsService } from './scan-analytics.service';
import { ScanAnalyticsController } from './scan-analytics.controller';
import { ScanMetric } from './entities/scan-metric.entity';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [TypeOrmModule.forFeature([ScanMetric]), EventsModule],
  providers: [ScanAnalyticsService],
  controllers: [ScanAnalyticsController],
  exports: [ScanAnalyticsService],
})
export class ScanAnalyticsModule {}
