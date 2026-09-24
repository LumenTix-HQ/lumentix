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

    it('treats non-2xx statuses (e.g. 400) as failures and retries', async () => {
      httpService.post.mockReturnValue(
        throwError(() => ({ response: { status: 400, data: { error: 'bad' } } })),
      );

      await job.handle({
        data: { ...baseJobData, attempt: 1 },
      } as any);

      expect(webhooksQueue.add).toHaveBeenCalled();
      expect(deadLetterRepo.save).not.toHaveBeenCalled();
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

  it('exposes the default constants used by retry logic', () => {
    expect(DEFAULT_MAX_RETRY_ATTEMPTS).toBe(5);
    expect(DEFAULT_BASE_BACKOFF_MS).toBe(5000);
  });
});