import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { WebhookDelivery } from '../entities/webhook-delivery.entity';
import { Event } from '../../events/entities/event.entity';

export interface WebhookJobData {
  eventId: string;
  paymentId: string;
  payload: Record<string, unknown>;
}

@Processor('webhooks')
export class WebhookDeliveryJob {
  constructor(
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    private readonly httpService: HttpService,
  ) {}

  @Process('send')
  async handle(job: Job<WebhookJobData>): Promise<void> {
    const { eventId, paymentId, payload } = job.data;
    const event = await this.eventRepo.findOne({ where: { id: eventId } });

    if (!event || !event.webhookUrl) {
      return;
    }

    const signature = crypto
      .createHmac('sha256', process.env.WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');

    const headers = {
      'Content-Type': 'application/json',
      'X-LumenTix-Signature': `sha256=${signature}`,
    };

    let statusCode: number | null = null;
    let responseBody: string | null = null;

    try {
      const response = await firstValueFrom(
        this.httpService.post(event.webhookUrl, payload, { headers }),
      );
      statusCode = response.status;
      responseBody = JSON.stringify(response.data);
    } catch (error) {
      if (error.response) {
        statusCode = error.response.status;
        responseBody = JSON.stringify(error.response.data);
      } else {
        responseBody = error.message;
      }
    }

    await this.deliveryRepo.save({
      eventId,
      paymentId,
      attempt: job.attemptsMade + 1,
      statusCode,
      responseBody,
    });

    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`Webhook delivery failed with status code: ${statusCode}`);
    }
  }
}