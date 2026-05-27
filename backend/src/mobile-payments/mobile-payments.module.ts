import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MobilePayment } from './entities/mobile-payment.entity';
import { MobilePaymentsService } from './mobile-payments.service';
import { MobilePaymentsController } from './mobile-payments.controller';
import { Event } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MobilePayment, Event, User]),
    AuditModule,
    NotificationModule,
  ],
  controllers: [MobilePaymentsController],
  providers: [MobilePaymentsService],
  exports: [MobilePaymentsService],
})
export class MobilePaymentsModule {}
