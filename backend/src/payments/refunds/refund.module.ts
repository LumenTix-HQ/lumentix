import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../entities/payment.entity';
import { TicketEntity } from '../../tickets/entities/ticket.entity';
import { Event } from '../../events/entities/event.entity';
import { User } from '../../users/entities/user.entity';
import { StellarModule } from '../../stellar/stellar.module';
import { AuditModule } from '../../audit/audit.module';
import { EscrowModule } from '../escrow.module';
import { RefundService } from './refund.service';
import { RefundController } from './refund.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, TicketEntity, Event, User]),
    StellarModule,
    AuditModule,
    EscrowModule,
  ],
  providers: [RefundService],
  controllers: [RefundController],
  exports: [RefundService],
})
export class RefundModule {}