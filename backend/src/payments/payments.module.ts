import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentsService } from './payments.service';
import { PaymentExpiryService } from './payment-expiry.service';
import { PaymentsController } from './payments.controller';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { StellarModule } from '../stellar/stellar.module';
import { EscrowModule } from './escrow.module';
import { RefundModule } from './refunds/refund.module';
import { NotificationModule } from '../notifications/notification.module';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, User]),
    forwardRef(() => EventsModule),
    StellarModule,
    AuditModule,
    EscrowModule,
    RefundModule,
    NotificationModule,
  ],
  providers: [PaymentsService, PaymentExpiryService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
