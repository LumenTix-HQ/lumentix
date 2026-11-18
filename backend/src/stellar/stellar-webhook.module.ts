import { Module } from '@nestjs/common';
import { StellarWebhookService } from './stellar-webhook.service';
import { StellarModule } from './stellar.module';
import { PaymentsModule } from '../payments/payments.module';
import { SponsorsModule } from '../sponsors/sponsors.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [
    StellarModule, // provides StellarService
    PaymentsModule, // provides PaymentsService
    SponsorsModule, // provides SponsorsService
    NotificationModule, // provides NotificationService
  ],
  providers: [StellarWebhookService],
  exports: [StellarWebhookService],
})
export class StellarWebhookModule {}
