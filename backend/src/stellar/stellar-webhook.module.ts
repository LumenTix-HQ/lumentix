import { Module } from '@nestjs/common';
import { StellarWebhookService } from './stellar-webhook.service';
import { StellarModule } from '../stellar.module';
import { PaymentsModule } from '../../payments/payments.module';
import { SponsorsModule } from '../../sponsors/sponsors.module';

@Module({
  imports: [
    StellarModule, // provides StellarService
    PaymentsModule, // provides PaymentsService
    SponsorsModule, // provides SponsorsService
  ],
  providers: [StellarWebhookService],
})
export class StellarWebhookModule {}
