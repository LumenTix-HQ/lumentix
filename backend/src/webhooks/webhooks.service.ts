import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WEBHOOK_QUEUE, WebhookJobData } from './jobs/webhook-delivery.job';
import { Event } from '../events/entities/event.entity';
import { Payment } from '../payments/entities/payment.entity';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
    @InjectQueue(WEBHOOK_QUEUE)
    private readonly webhookQueue: Queue<WebhookJobData>,
    private readonly configService: ConfigService,
  ) {}

  async queueDelivery(event: Event, payment: Payment): Promise<void> {
    if (!event.webhookUrl) {
      return;
    }

    const delivery = this.deliveryRepo.create({
      eventId: event.id,
      paymentId: payment.id,
      url: event.webhookUrl,
      attempt: 0,
    });

    const saved = await this.deliveryRepo.save(delivery);

    const secret =
      this.configService.get<string>('WEBHOOK_SECRET') ?? 'lumentix-webhook-secret';

    const payload: Record<string, unknown> = {
      event: 'payment.status_changed',
      eventId: event.id,
      paymentId: payment.id,
      status: payment.status,
      currency: payment.currency,
      amount: payment.amount,
      timestamp: new Date().toISOString(),
    };

    await this.webhookQueue.add('deliver', {
      deliveryId: saved.id,
      url: event.webhookUrl,
      payload,
      secret,
      attempt: 1,
    });

    this.logger.log(
      `Queued webhook delivery ${saved.id} for payment ${payment.id} to ${event.webhookUrl}`,
    );
  }

  async getDeliveries(eventId: string): Promise<WebhookDelivery[]> {
    return this.deliveryRepo.find({
      where: { eventId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }
}
