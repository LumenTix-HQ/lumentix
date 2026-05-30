import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentExpiryJob } from './jobs/payment-expiry.job';
import { Payment } from './entities/payment.entity';
import { User } from '../users/entities/user.entity';
import { CurrenciesModule } from '../currencies/currencies.module';
import { EventsModule } from '../events/events.module';
import { StellarModule } from '../stellar/stellar.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notifications/notification.module';
import { PaymentAnalyticsController } from './controllers/payment-analytics.controller';
import { PaymentAnalyticsService } from './services/payment-analytics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment]),
import { WebhooksModule } from '../webhooks/webhooks.module';

    TypeOrmModule.forFeature([Payment, User]),
    ScheduleModule,
    CurrenciesModule,
    EventsModule,
    StellarModule,
    AuditModule,
    NotificationModule,
    WebhooksModule,
  ],
  controllers: [PaymentsController, PaymentAnalyticsController],
  providers: [
    PaymentsService,
    PaymentExpiryJob,
    PaymentAnalyticsService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
