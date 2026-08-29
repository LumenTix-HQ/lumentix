import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhookDeadLetter } from './entities/webhook-dead-letter.entity';
import { WebhookDeliveryJob } from './jobs/webhook-delivery.job';
import { Event } from '../events/entities/event.entity';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookDelivery, WebhookDeadLetter, Event]),
    // Retries are scheduled explicitly by WebhookDeliveryJob (configurable via
    // WEBHOOK_MAX_RETRY_ATTEMPTS / WEBHOOK_RETRY_BASE_DELAY_MS), so the queue
    // itself does not need Bull's built-in attempts/backoff.
    BullModule.registerQueue({
      name: 'webhooks',
    }),
    HttpModule,
    AuthModule,
    AdminModule,
  ],
  providers: [WebhookDeliveryJob, WebhooksService],
  controllers: [WebhooksController],
  exports: [BullModule, WebhooksService],
})
export class WebhooksModule {}