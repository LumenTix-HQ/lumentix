import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { WebhookDelivery } from '../entities/webhook-delivery.entity';
import { WebhookDeadLetter } from '../entities/webhook-dead-letter.entity';
import { Event } from '../../events/entities/event.entity';

export interface WebhookJobData {
  eventId: string;
  paymentId: string;
  payload: Record<string, unknown>;
  /** 1-indexed attempt number; defaults to 1 for the initial delivery. */
  attempt?: number;
}

/** Default retry/backoff configuration, overridable via env vars. */
export const DEFAULT_MAX_RETRY_ATTEMPTS = 5;
export const DEFAULT_BASE_BACKOFF_MS = 5000;
export const MAX_BACKOFF_MS = 5 * 60 * 1000;

@Processor('webhooks')
export class WebhookDeliveryJob {
  constructor(
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
    @InjectRepository(WebhookDeadLetter)
    private readonly deadLetterRepo: Repository<WebhookDeadLetter>,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    private readonly httpService: HttpService,
    @InjectQueue('webhooks') private readonly webhooksQueue: Queue,
  ) {}

  private get maxAttempts(): number {
    const configured = parseInt(process.env.WEBHOOK_MAX_RETRY_ATTEMPTS ?? '', 10);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_MAX_RETRY_ATTEMPTS;
  }

  private get baseBackoffMs(): number {
    const configured = parseInt(process.env.WEBHOOK_RETRY_BASE_DELAY_MS ?? '', 10);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_BASE_BACKOFF_MS;
  }

  /** Exponential backoff delay (ms) for a given attempt number, capped at MAX_BACKOFF_MS. */
  applyBackoffDelay(attempt: number): number {
    const delay = this.baseBackoffMs * 2 ** (attempt - 1);
    return Math.min(delay, MAX_BACKOFF_MS);
  }

  @Process('send')
  async handle(job: Job<WebhookJobData>): Promise<void> {
    const { eventId, paymentId, payload } = job.data;
    const attempt = job.data.attempt ?? 1;
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
      attempt,
      statusCode,
      responseBody,
    });

    const succeeded = statusCode !== null && statusCode >= 200 && statusCode < 300;
    if (succeeded) {
      return;
    }

    if (attempt < this.maxAttempts) {
      await this.scheduleWebhookRetry({ eventId, paymentId, payload }, attempt);
    } else {
      await this.moveToDeadLetter({ eventId, paymentId, payload }, statusCode, responseBody, attempt);
    }
  }

  /** Enqueues the next delivery attempt after an exponential backoff delay. */
  async scheduleWebhookRetry(
    data: Omit<WebhookJobData, 'attempt'>,
    previousAttempt: number,
  ): Promise<void> {
    const nextAttempt = previousAttempt + 1;
    const delay = this.applyBackoffDelay(previousAttempt);
    await this.webhooksQueue.add(
      'send',
      { ...data, attempt: nextAttempt },
      { delay },
    );
  }

  /** Persists a delivery that exhausted all retry attempts for manual follow-up. */
  async moveToDeadLetter(
    data: Omit<WebhookJobData, 'attempt'>,
    lastStatusCode: number | null,
    lastError: string | null,
    attempts: number,
  ): Promise<void> {
    await this.deadLetterRepo.save({
      eventId: data.eventId,
      paymentId: data.paymentId,
      payload: data.payload,
      lastStatusCode,
      lastError,
      attempts,
    });
  }
}
