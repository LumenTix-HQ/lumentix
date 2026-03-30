import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketEntity } from './entities/ticket.entity';
import { TicketSigningService } from './ticket-signing.service';
import { Event } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { PaymentsModule } from '../payments/payments.module';
import { StellarModule } from '../stellar/stellar.module';
import { NotificationModule } from '../notifications/notification.module';
import { VerificationController } from './verification/verification.controller';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([TicketEntity, Event, User]),
    forwardRef(() => PaymentsModule),
    StellarModule,
    NotificationModule,
  ],
  providers: [TicketsService, TicketSigningService],
  controllers: [TicketsController, VerificationController],
  exports: [TicketsService],
})
export class TicketsModule {}
