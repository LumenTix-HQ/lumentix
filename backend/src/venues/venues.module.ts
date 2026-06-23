import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { VenueSection } from './entities/venue-section.entity';
import { Seat } from './entities/seat.entity';
import { IotSensor } from './entities/iot-sensor.entity';
import { VenueCapacitySnapshot } from './entities/venue-capacity-snapshot.entity';

import { VenuesService } from './venues.service';
import { VenuesController } from './venues.controller';
import { IotCapacityService } from './iot-capacity.service';
import { IotCapacityController } from './iot-capacity.controller';

import { EventsModule } from '../events/events.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notifications/notification.module';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Event } from '../events/entities/event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VenueSection,
      Seat,
      IotSensor,
      VenueCapacitySnapshot,
      TicketEntity,
      Event,
    ]),
    EventsModule,
    AuditModule,
    NotificationModule,
  ],
  controllers: [VenuesController, IotCapacityController],
  providers: [VenuesService, IotCapacityService],
  exports: [VenuesService, IotCapacityService],
})
export class VenuesModule {}
