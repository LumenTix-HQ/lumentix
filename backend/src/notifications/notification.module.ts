import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NotificationService } from './notification.service';
import { NotificationProcessor } from './notification.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'notifications', // Must match the string in @Processor
    }),
  ],
  providers: [NotificationService, NotificationProcessor],
  exports: [NotificationService], // Allow Payments/Sponsors to import this
})
export class NotificationModule {}
