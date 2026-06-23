import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhooksService } from './webhooks.service';
import { WebhookDeliveryJob, WEBHOOK_QUEUE } from './jobs/webhook-delivery.job';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookDelivery]),
    BullModule.registerQueue({ name: WEBHOOK_QUEUE }),
  ],
  providers: [WebhooksService, WebhookDeliveryJob],
  exports: [WebhooksService],
})
export class WebhooksModule {}
