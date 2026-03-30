import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './entities/event.entity';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { EventStateService } from './state/event-state.service';
import { TicketsModule } from '../tickets/tickets.module';
import { NotificationModule } from '../notifications/notification.module';
import { EscrowModule } from '../payments/escrow.module';
import { User } from '../users/entities/user.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, User, TicketEntity]),
    forwardRef(() => TicketsModule),
    NotificationModule,
    EscrowModule,
  ],
  controllers: [EventsController],
  providers: [EventsService, EventStateService],
  exports: [EventsService],
})
export class EventsModule {}
