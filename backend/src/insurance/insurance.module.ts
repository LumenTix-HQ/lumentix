import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InsurancePolicyEntity } from './entities/insurance-policy.entity';
import { InsuranceService } from './insurance.service';
import { InsuranceController } from './insurance.controller';

import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Event } from '../events/entities/event.entity';
import { Payment } from '../payments/entities/payment.entity';
import { User } from '../users/entities/user.entity';

import { StellarModule } from '../stellar/stellar.module';
import { AuditModule } from '../audit/audit.module';
import { EscrowModule } from '../payments/escrow.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      InsurancePolicyEntity,
      TicketEntity,
      Event,
      Payment,
      User,
    ]),
    StellarModule,
    AuditModule,
    EscrowModule,
  ],
  providers: [InsuranceService],
  controllers: [InsuranceController],
  exports: [InsuranceService],
})
export class InsuranceModule {}
