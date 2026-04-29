import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './entities/event.entity';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { EventStateService } from './state/event-state.service';
import { TicketsModule } from '../tickets/tickets.module';
import { NotificationModule } from '../notifications/notification.module';
import { EscrowModule } from '../payments/escrow.module';
import { AuditModule } from '../audit/audit.module';
import { User } from '../users/entities/user.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Payment } from '../payments/entities/payment.entity';
import { SponsorContribution } from '../sponsors/entities/sponsor-contribution.entity';
import { RefundModule } from '../payments/refunds/refund.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, User, TicketEntity, Payment, SponsorContribution]),
    forwardRef(() => TicketsModule),
    NotificationModule,
    EscrowModule,
    AuditModule,
    forwardRef(() => RefundModule),
  ],
  controllers: [EventsController],
  providers: [EventsService, EventStateService],
  exports: [EventsService],
})
export class EventsModule {}
