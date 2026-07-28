import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImpactService } from './impact.service';
import { ImpactController } from './impact.controller';
import { EventImpact } from './entities/event-impact.entity';
import { SustainabilityMetric } from './entities/sustainability-metric.entity';
import { Event } from '../events/entities/event.entity';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [TypeOrmModule.forFeature([EventImpact, SustainabilityMetric, Event]), EventsModule],
  controllers: [ImpactController],
  providers: [ImpactService],
  exports: [ImpactService],
})
export class ImpactModule {}
