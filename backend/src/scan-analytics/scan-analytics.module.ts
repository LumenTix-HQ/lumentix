import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScanAnalyticsService } from './scan-analytics.service';
import { ScanAnalyticsController } from './scan-analytics.controller';
import { ScanEvent } from './entities/scan-event.entity';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [TypeOrmModule.forFeature([ScanEvent]), EventsModule],
  controllers: [ScanAnalyticsController],
  providers: [ScanAnalyticsService],
  exports: [ScanAnalyticsService],
})
export class ScanAnalyticsModule {}
