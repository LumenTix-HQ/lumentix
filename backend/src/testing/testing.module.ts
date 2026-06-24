import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TestingService } from './testing.service';
import { TestingController } from './testing.controller';
import { Event } from '../events/entities/event.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Payment } from '../payments/entities/payment.entity';
import { User } from '../users/entities/user.entity';
import { EventsModule } from '../events/events.module';
import { TicketsModule } from '../tickets/tickets.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, TicketEntity, Payment, User]),
    EventsModule,
    TicketsModule,
    PaymentsModule,
  ],
  controllers: [TestingController],
  providers: [TestingService],
  exports: [TestingService],
})
export class TestingModule {}
