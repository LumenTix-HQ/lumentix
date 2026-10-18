import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { Logger } from '@nestjs/common';
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
export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

/**
 * 4xx responses that may succeed on a later attempt. Every other 4xx means the
 * endpoint rejected the payload itself, so retrying would only repeat it.
 */
const RETRYABLE_CLIENT_STATUSES = new Set([408, 409, 425, 429]);

/** Whether a failed attempt is worth retrying (network errors, 5xx, throttling). */
export function isRetryableStatus(statusCode: number | null): boolean {
  if (statusCode === null || statusCode >= 500) return true;
  return RETRYABLE_CLIENT_STATUSES.has(statusCode);
}

/** Parses a Retry-After header (delta-seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(header: unknown, now: number = Date.now()): number | null {
  if (typeof header !== 'string' && typeof header !== 'number') return null;
  const value = String(header).trim();
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(date - now, 0);
}

@Processor('webhooks')
export class WebhookDeliveryJob {
  private readonly logger = new Logger(WebhookDeliveryJob.name);

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

  private get requestTimeoutMs(): number {
    const configured = parseInt(process.env.WEBHOOK_REQUEST_TIMEOUT_MS ?? '', 10);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /**
   * Exponential backoff delay (ms) for a given attempt number, capped at
   * MAX_BACKOFF_MS. A Retry-After hint from the endpoint takes precedence
   * when it asks for a longer wait (still subject to the cap).
   */
  applyBackoffDelay(attempt: number, retryAfterMs: number | null = null): number {
    const delay = Math.max(this.baseBackoffMs * 2 ** (attempt - 1), retryAfterMs ?? 0);
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

    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (!webhookSecret) {
      this.logger.error(
        `WebhookDeliveryJob: WEBHOOK_SECRET is not set for event ${eventId}`,
      );
      await this.moveToDeadLetter(
        { eventId, paymentId, payload },
        null,
        'WEBHOOK_SECRET is not configured',
        attempt,
      );
      return;
    }

    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    const headers = {
      'Content-Type': 'application/json',
      'X-LumenTix-Signature': `sha256=${signature}`,
    };

    let statusCode: number | null = null;
    let responseBody: string | null = null;
    let retryAfterMs: number | null = null;

    try {
      const response = await firstValueFrom(
        this.httpService.post(event.webhookUrl, payload, {
          headers,
          timeout: this.requestTimeoutMs,
        }),
      );
      statusCode = response.status;
      responseBody = JSON.stringify(response.data);
    } catch (error) {
      if (error.response) {
        statusCode = error.response.status;
        responseBody = JSON.stringify(error.response.data);
        retryAfterMs = parseRetryAfter(error.response.headers?.['retry-after']);
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

    if (attempt < this.maxAttempts && isRetryableStatus(statusCode)) {
      await this.scheduleWebhookRetry({ eventId, paymentId, payload }, attempt, retryAfterMs);
    } else {
      await this.moveToDeadLetter({ eventId, paymentId, payload }, statusCode, responseBody, attempt);
    }
  }

  /** Enqueues the next delivery attempt after an exponential backoff delay. */
  async scheduleWebhookRetry(
    data: Omit<WebhookJobData, 'attempt'>,
    previousAttempt: number,
    retryAfterMs: number | null = null,
  ): Promise<void> {
    const nextAttempt = previousAttempt + 1;
    const delay = this.applyBackoffDelay(previousAttempt, retryAfterMs);
    await this.webhooksQueue.add(
      'send',
      { ...data, attempt: nextAttempt },
      { delay },
    );
  }

  /**
   * Persists a delivery that exhausted its retry attempts, or failed with a
   * non-retryable status, for manual follow-up.
   */
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
    this.logger.warn(
      `Webhook for event ${data.eventId} / payment ${data.paymentId} dead-lettered after ` +
        `${attempts} attempt(s) (last status: ${lastStatusCode ?? 'network error'})`,
    );
  }
}
