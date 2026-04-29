import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Registration } from './entities/registration.entity';
import { RegistrationsService } from './registrations.service';
import { RegistrationsController } from './registrations.controller';
import { EventsModule } from '../events/events.module';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { RefundModule } from '../payments/refunds/refund.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notifications/notification.module';
import { UsersModule } from '../users/users.module';
import { WaitlistExpiryJob } from './jobs/waitlist-expiry.job';

@Module({
  imports: [
    TypeOrmModule.forFeature([Registration, TicketEntity]),
    EventsModule,
    RefundModule,
    AuditModule,
    NotificationModule,
    UsersModule,
  ],
  controllers: [RegistrationsController],
  providers: [RegistrationsService, WaitlistExpiryJob],
  exports: [RegistrationsService],
})
export class RegistrationsModule {}
