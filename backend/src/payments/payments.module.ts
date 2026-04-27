import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentExpiryJob } from './jobs/payment-expiry.job';
import { Payment } from './entities/payment.entity';
import { CurrenciesModule } from '../currencies/currencies.module';
import { EventsModule } from '../events/events.module';
import { StellarModule } from '../stellar/stellar.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment]),
    ScheduleModule,           // Issue #127 – needed for @Cron decorator
    CurrenciesModule,         // Issue #128 – currency validation
    EventsModule,
    StellarModule,            // Issue #129 – path payments
    AuditModule,              // Issue #127 – audit logging on expiry
    NotificationModule,       // Issue #127 – email on expiry
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentExpiryJob,         // Issue #127 – scheduled expiry job
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
