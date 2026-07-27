import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { stellarConfig } from './stellar.config';
import { StellarController } from './stellar.controller';
import { StellarService, PAYMENT_RETRY_QUEUE } from './stellar.service';
import { UsersModule } from '../users/users.module';
import { Payment } from '../payments/entities/payment.entity';
import { AuditModule } from '../audit/audit.module';
import { RetryPaymentJob } from '../payments/jobs/retry-payment.job';

@Module({
  imports: [
    ConfigModule.forFeature(stellarConfig),
    UsersModule,
    AuditModule,
    TypeOrmModule.forFeature([Payment]),
    BullModule.registerQueue({
      name: PAYMENT_RETRY_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    }),
  ],
  controllers: [StellarController],
  providers: [StellarService, RetryPaymentJob],
  exports: [StellarService],
})
export class StellarModule {}
