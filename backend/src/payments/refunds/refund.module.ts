import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../entities/payment.entity';
import { TicketEntity } from '../../tickets/entities/ticket.entity';
import { Event } from '../../events/entities/event.entity';
import { EventSeries } from '../../events/entities/event-series.entity';
import { User } from '../../users/entities/user.entity';
import { StellarModule } from '../../stellar/stellar.module';
import { AuditModule } from '../../audit/audit.module';
import { EscrowModule } from '../escrow.module';
import { NotificationModule } from '../../notifications/notification.module';
import { RefundService } from './refund.service';
import { RefundCalculatorService } from './refund-calculator.service';
import { RefundController } from './refund.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, TicketEntity, Event, EventSeries, User]),
    StellarModule,
    AuditModule,
    EscrowModule,
    NotificationModule,
  ],
  providers: [RefundService, RefundCalculatorService],
  controllers: [RefundController],
  exports: [RefundService],
})
export class RefundModule {}
