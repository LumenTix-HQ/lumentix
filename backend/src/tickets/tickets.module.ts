import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { TicketEntity } from './entities/ticket.entity';
import { TicketSigningService } from './ticket-signing.service';
import { TicketPdfService } from './ticket-pdf.service';
import { Event } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { TicketsService } from './tickets.service';
import { TicketsController, TicketsPublicController } from './tickets.controller';
import { PaymentsModule } from '../payments/payments.module';
import { StellarModule } from '../stellar/stellar.module';
import { NotificationModule } from '../notifications/notification.module';
import { VerificationController } from './verification/verification.controller';
import { TicketExpiryJob } from './jobs/ticket-expiry.job';
import { AuditModule } from '../audit/audit.module';
import { ResaleService } from './resale/resale.service';
import { ResaleController } from './resale/resale.controller';
import { ResaleTransaction } from './resale/resale-transaction.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([TicketEntity, Event, User, ResaleTransaction]),
    forwardRef(() => PaymentsModule),
    StellarModule,
    NotificationModule,
    AuditModule,
  ],
  providers: [TicketsService, TicketSigningService, TicketPdfService, TicketExpiryJob, ResaleService],
  controllers: [TicketsController, TicketsPublicController, VerificationController, ResaleController],
  exports: [TicketsService, ResaleService],
})
export class TicketsModule {}
