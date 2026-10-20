import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reflector } from '@nestjs/core';
import { SchedulingService } from './scheduling.service';
import { SchedulingController } from './scheduling.controller';
import { Event } from '../events/entities/event.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Registration } from '../registrations/entities/registration.entity';
import { Venue } from '../venues/entities/venue.entity';
import { RolesGuard } from '../admin/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, TicketEntity, Payment, Registration, Venue]),
  ],
  controllers: [SchedulingController],
  providers: [SchedulingService, RolesGuard, Reflector],
  exports: [SchedulingService],
})
export class SchedulingModule {}
