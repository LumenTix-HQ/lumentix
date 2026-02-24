import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { StellarModule } from '../stellar/stellar.module';
import { EscrowModule } from './escrow.module';
import { RefundModule } from './refunds/refund.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment]),
    EventsModule,
    StellarModule,
    AuditModule,
    EscrowModule,
    RefundModule,
  ],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
