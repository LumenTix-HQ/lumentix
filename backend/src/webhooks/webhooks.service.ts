import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from '../events/entities/event.entity';
import { Payment } from '../payments/entities/payment.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';

@Injectable()
export class WebhooksService {
  constructor(
    @InjectQueue('webhooks') private readonly webhooksQueue: Queue,
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
  ) {}

  async queueDelivery(event: Event, payment: Payment): Promise<void> {
    if (!event.webhookUrl) {
      return;
    }

    const payload = {
      paymentId: payment.id,
      eventId: event.id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      transactionHash: payment.transactionHash,
      confirmedAt: payment.status === 'confirmed' ? payment.updatedAt : null,
    };

    await this.webhooksQueue.add('send', {
      eventId: event.id,
      paymentId: payment.id,
      payload,
    });
  }

  async getDeliveriesForEvent(eventId: string, organizerId: string) {
    // This is a placeholder for the actual implementation
    // which should include an organizer guard.
    return this.deliveryRepo.find({
      where: { eventId },
      order: { sentAt: 'DESC' },
      take: 50,
    });
  }
}