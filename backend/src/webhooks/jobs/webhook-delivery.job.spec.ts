import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import {
  DEFAULT_MAX_RETRY_ATTEMPTS,
  DEFAULT_BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  WebhookDeliveryJob,
  isRetryableStatus,
  parseRetryAfter,
} from './webhook-delivery.job';
import { WebhookDelivery } from '../entities/webhook-delivery.entity';
import { WebhookDeadLetter } from '../entities/webhook-dead-letter.entity';
import { Event } from '../../events/entities/event.entity';

describe('WebhookDeliveryJob', () => {
  let job: WebhookDeliveryJob;
  let deliveryRepo: { save: jest.Mock };
  let deadLetterRepo: { save: jest.Mock };
  let eventRepo: { findOne: jest.Mock };
  let httpService: { post: jest.Mock };
  let webhooksQueue: { add: jest.Mock };

  const baseJobData = {
    eventId: 'e1',
    paymentId: 'p1',
    payload: { paymentId: 'p1', eventId: 'e1' },
  };

  beforeEach(async () => {
    process.env.WEBHOOK_SECRET = 'test-secret';
    deliveryRepo = { save: jest.fn().mockResolvedValue(undefined) };
    deadLetterRepo = { save: jest.fn().mockResolvedValue(undefined) };
    eventRepo = { findOne: jest.fn() };
    httpService = { post: jest.fn() };
    webhooksQueue = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveryJob,
        { provide: getRepositoryToken(WebhookDelivery), useValue: deliveryRepo },
        { provide: getRepositoryToken(WebhookDeadLetter), useValue: deadLetterRepo },
        { provide: getRepositoryToken(Event), useValue: eventRepo },
        { provide: HttpService, useValue: httpService },
        { provide: getQueueToken('webhooks'), useValue: webhooksQueue },
      ],
    }).compile();

    job = module.get<WebhookDeliveryJob>(WebhookDeliveryJob);
  });

  afterEach(() => {
    delete process.env.WEBHOOK_MAX_RETRY_ATTEMPTS;
    delete process.env.WEBHOOK_RETRY_BASE_DELAY_MS;
    delete process.env.WEBHOOK_SECRET;
  });

  describe('applyBackoffDelay', () => {
    it('grows exponentially from the base delay', () => {
      expect(job.applyBackoffDelay(1)).toBe(DEFAULT_BASE_BACKOFF_MS);
      expect(job.applyBackoffDelay(2)).toBe(2 * DEFAULT_BASE_BACKOFF_MS);
      expect(job.applyBackoffDelay(3)).toBe(4 * DEFAULT_BASE_BACKOFF_MS);
      expect(job.applyBackoffDelay(4)).toBe(8 * DEFAULT_BASE_BACKOFF_MS);
    });

    it('caps the delay at MAX_BACKOFF_MS', () => {
      expect(job.applyBackoffDelay(30)).toBe(MAX_BACKOFF_MS);
      expect(job.applyBackoffDelay(100)).toBeLessThanOrEqual(MAX_BACKOFF_MS);
    });

    it('honours a longer Retry-After hint, still capped at MAX_BACKOFF_MS', () => {
      expect(job.applyBackoffDelay(1, 30_000)).toBe(30_000);
      expect(job.applyBackoffDelay(3, 1_000)).toBe(4 * DEFAULT_BASE_BACKOFF_MS);
      expect(job.applyBackoffDelay(1, 60 * 60_000)).toBe(MAX_BACKOFF_MS);
    });

    it('uses the configured base delay env var', () => {
      process.env.WEBHOOK_RETRY_BASE_DELAY_MS = '2000';
      expect(job['baseBackoffMs']).toBe(2_000);
    });
  });

  describe('handle', () => {
    beforeEach(() => {
      eventRepo.findOne.mockResolvedValue({
        id: 'e1',
        webhookUrl: 'https://example.com/hook',
      });
    });

    it('records a successful 2xx delivery without retrying or dead-lettering', async () => {
      httpService.post.mockReturnValue(of({ status: 200, data: { ok: true } }));

      await job.handle({
        data: { ...baseJobData, attempt: 1 },
      } as any);

      expect(deliveryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 'e1', attempt: 1, statusCode: 200 }),
      );
      expect(webhooksQueue.add).not.toHaveBeenCalled();
      expect(deadLetterRepo.save).not.toHaveBeenCalled();
    });

    it('schedules a retry with backoff when a 5xx occurs below the attempt cap', async () => {
      httpService.post.mockReturnValue(
        throwError(() => ({ response: { status: 500, data: { error: 'boom' } } })),
      );

      await job.handle({
        data: { ...baseJobData, attempt: 1 },
      } as any);

      expect(deliveryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 }),
      );
      expect(webhooksQueue.add).toHaveBeenCalledWith(
        'send',
        { ...baseJobData, attempt: 2 },
        { delay: DEFAULT_BASE_BACKOFF_MS },
      );
      expect(deadLetterRepo.save).not.toHaveBeenCalled();
    });

    it('dead-letters permanent 4xx failures immediately instead of retrying', async () => {
      httpService.post.mockReturnValue(
        throwError(() => ({ response: { status: 400, data: { error: 'bad' } } })),
      );

      await job.handle({
        data: { ...baseJobData, attempt: 1 },
      } as any);

      expect(webhooksQueue.add).not.toHaveBeenCalled();
      expect(deadLetterRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ lastStatusCode: 400, attempts: 1 }),
      );
    });

    it('retries 429 responses, waiting at least as long as Retry-After', async () => {
      httpService.post.mockReturnValue(
        throwError(() => ({
          response: { status: 429, data: {}, headers: { 'retry-after': '60' } },
        })),
      );

      await job.handle({
        data: { ...baseJobData, attempt: 1 },
      } as any);

      expect(webhooksQueue.add).toHaveBeenCalledWith(
        'send',
        { ...baseJobData, attempt: 2 },
        { delay: 60_000 },
      );
      expect(deadLetterRepo.save).not.toHaveBeenCalled();
    });

    it('sends with a request timeout so a hanging endpoint cannot stall the worker', async () => {
      httpService.post.mockReturnValue(of({ status: 200, data: {} }));

      await job.handle({ data: { ...baseJobData, attempt: 1 } } as any);

      expect(httpService.post).toHaveBeenCalledWith(
        'https://example.com/hook',
        baseJobData.payload,
        expect.objectContaining({ timeout: 10_000 }),
      );
    });

    it('moves to the dead-letter queue once the retry cap is reached', async () => {
      process.env.WEBHOOK_MAX_RETRY_ATTEMPTS = '2';
      httpService.post.mockReturnValue(
        throwError(() => ({ response: { status: 500 } })),
      );

      await job.handle({
        data: { ...baseJobData, attempt: 2 },
      } as any);

      expect(deadLetterRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 'e1', attempts: 2 }),
      );
      expect(webhooksQueue.add).not.toHaveBeenCalled();
    });

    it('records a network-level failure and retries', async () => {
      httpService.post.mockReturnValue(throwError(() => new Error('ECONNREFUSED')));

      await job.handle({
        data: { ...baseJobData, attempt: 1 },
      } as any);

      expect(deliveryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: null, responseBody: 'ECONNREFUSED' }),
      );
      expect(webhooksQueue.add).toHaveBeenCalled();
    });

    it('is a no-op when the event has no webhook URL', async () => {
      eventRepo.findOne.mockResolvedValue({ id: 'e1', webhookUrl: null });
      httpService.post.mockReturnValue(of({ status: 200, data: {} }));

      await job.handle({
        data: { ...baseJobData, attempt: 1 },
      } as any);

      expect(deliveryRepo.save).not.toHaveBeenCalled();
      expect(webhooksQueue.add).not.toHaveBeenCalled();
      expect(deadLetterRepo.save).not.toHaveBeenCalled();
    });

    it('dead-letters without sending when WEBHOOK_SECRET is not configured', async () => {
      delete process.env.WEBHOOK_SECRET;

      await job.handle({ data: { ...baseJobData, attempt: 1 } } as any);

      expect(httpService.post).not.toHaveBeenCalled();
      expect(deadLetterRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ lastError: 'WEBHOOK_SECRET is not configured' }),
      );
    });

    it('is a no-op when the event is missing', async () => {
      eventRepo.findOne.mockResolvedValue(null);

      await job.handle({
        data: { ...baseJobData, attempt: 1 },
      } as any);

      expect(deliveryRepo.save).not.toHaveBeenCalled();
      expect(webhooksQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('moveToDeadLetter', () => {
    it('persists the payload and attempt count', async () => {
      await job.moveToDeadLetter(baseJobData, 500, '{"error":"boom"}', 5);

      expect(deadLetterRepo.save).toHaveBeenCalledWith({
        eventId: 'e1',
        paymentId: 'p1',
        payload: baseJobData.payload,
        lastStatusCode: 500,
        lastError: '{"error":"boom"}',
        attempts: 5,
      });
    });
  });

  describe('isRetryableStatus', () => {
    it.each([null, 500, 502, 503, 408, 429])('retries %p', (status) => {
      expect(isRetryableStatus(status)).toBe(true);
    });

    it.each([400, 401, 403, 404, 410, 422])('does not retry %p', (status) => {
      expect(isRetryableStatus(status)).toBe(false);
    });
  });

  describe('parseRetryAfter', () => {
    it('parses delta-seconds', () => {
      expect(parseRetryAfter('120')).toBe(120_000);
    });

    it('parses an HTTP date relative to now', () => {
      const now = Date.parse('2026-01-01T00:00:00Z');
      expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:30 GMT', now)).toBe(30_000);
    });

    it('ignores missing or malformed values', () => {
      expect(parseRetryAfter(undefined)).toBeNull();
      expect(parseRetryAfter('soon')).toBeNull();
    });
  });

  it('exposes the default constants used by retry logic', () => {
    expect(DEFAULT_MAX_RETRY_ATTEMPTS).toBe(5);
    expect(DEFAULT_BASE_BACKOFF_MS).toBe(5000);
  });
});