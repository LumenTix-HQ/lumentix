import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Registration } from './entities/registration.entity';
import { RegistrationsService } from './registrations.service';
import { RegistrationsController } from './registrations.controller';
import { EventsModule } from '../events/events.module';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { RefundModule } from '../payments/refunds/refund.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Registration, TicketEntity]),
    EventsModule,
    RefundModule,
    AuditModule,
  ],
  controllers: [RegistrationsController],
  providers: [RegistrationsService],
  exports: [RegistrationsService],
})
export class RegistrationsModule {}
