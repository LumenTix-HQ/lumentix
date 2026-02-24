import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketEntity } from './entities/ticket.entity';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { PaymentsModule } from '../payments/payments.module';
import { StellarModule } from '../stellar/stellar.module';
import { VerificationController } from './verification/verification.controller';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([TicketEntity]),
    PaymentsModule,
    StellarModule,
  ],
  providers: [TicketsService],
  controllers: [TicketsController, VerificationController],
  exports: [TicketsService],
})
export class TicketsModule {}
