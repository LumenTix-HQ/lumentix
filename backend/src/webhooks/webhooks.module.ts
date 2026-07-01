import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhookDeliveryJob } from './jobs/webhook-delivery.job';
import { Event } from '../events/entities/event.entity';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookDelivery, Event]),
    BullModule.registerQueue({
      name: 'webhooks',
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
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