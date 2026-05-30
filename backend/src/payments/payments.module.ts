import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentExpiryJob } from './jobs/payment-expiry.job';
import { Payment } from './entities/payment.entity';
import { EventSeries } from '../events/entities/event-series.entity';
import { Event } from '../events/entities/event.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { User } from '../users/entities/user.entity';
import { CurrenciesModule } from '../currencies/currencies.module';
import { EventsModule } from '../events/events.module';
import { StellarModule } from '../stellar/stellar.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notifications/notification.module';
import { EscrowModule } from './escrow.module';
import { RefundModule } from './refunds/refund.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, EventSeries, Event, TicketEntity, User]),
    TypeOrmModule.forFeature([Payment]),


    TypeOrmModule.forFeature([Payment, User]),
    ScheduleModule,
    CurrenciesModule,
    EventsModule,
    StellarModule,
    AuditModule,
    NotificationModule,
    EscrowModule,
    forwardRef(() => RefundModule),
    WebhooksModule,
  ],
  controllers: [PaymentsController, PaymentAnalyticsController],
  providers: [
    PaymentsService,
    PaymentExpiryJob,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
