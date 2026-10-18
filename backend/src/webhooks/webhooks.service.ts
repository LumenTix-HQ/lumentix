import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from '../events/entities/event.entity';
import { Payment } from '../payments/entities/payment.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhookDeadLetter } from './entities/webhook-dead-letter.entity';

@Injectable()
export class WebhooksService {
  constructor(
    @InjectQueue('webhooks') private readonly webhooksQueue: Queue,
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
    @InjectRepository(WebhookDeadLetter)
    private readonly deadLetterRepo: Repository<WebhookDeadLetter>,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
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
    await this.assertEventOrganizer(eventId, organizerId);
    return this.deliveryRepo.find({
      where: { eventId },
      order: { sentAt: 'DESC' },
      take: 50,
    });
  }

  async getDeadLettersForEvent(eventId: string, organizerId: string) {
    await this.assertEventOrganizer(eventId, organizerId);
    return this.deadLetterRepo.find({
      where: { eventId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  /**
   * Re-queues a dead-lettered delivery as a fresh first attempt (with the full
   * retry budget) once the organizer has fixed their endpoint, and removes it
   * from the dead-letter table.
   */
  async replayDeadLetter(
    eventId: string,
    deadLetterId: string,
    organizerId: string,
  ): Promise<{ queued: true }> {
    await this.assertEventOrganizer(eventId, organizerId);

    const deadLetter = await this.deadLetterRepo.findOne({
      where: { id: deadLetterId, eventId },
    });
    if (!deadLetter) {
      throw new NotFoundException(`Webhook dead letter "${deadLetterId}" not found`);
    }

    await this.webhooksQueue.add('send', {
      eventId: deadLetter.eventId,
      paymentId: deadLetter.paymentId,
      payload: deadLetter.payload,
    });
    await this.deadLetterRepo.delete({ id: deadLetter.id });
    return { queued: true };
  }

  private async assertEventOrganizer(eventId: string, organizerId: string): Promise<void> {
    const event = await this.eventRepo.findOne({
      where: { id: eventId },
      select: ['id', 'organizerId'],
    });
    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found`);
    }
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('Only the event organizer can manage its webhooks');
    }
  }
}
