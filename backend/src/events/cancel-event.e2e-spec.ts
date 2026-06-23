import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from '../../src/app.module';
import { RefundService } from '../../src/refunds/refund.service';

describe('Event Cancellation Flow (e2e)', () => {
  let app: INestApplication;

  const mockRefundService = {
    refundEvent: jest.fn().mockResolvedValue({
      success: true,
      refundedCount: 3,
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule =
      await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(RefundService)
        .useValue(mockRefundService)
        .compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('PATCH /events/:id/cancel', () => {
    it('should allow organizer to cancel an event', async () => {
      const eventId = 'event-id';

      const response = await request(app.getHttpServer())
        .patch(`/events/${eventId}/cancel`)
        .set('Authorization', 'Bearer organizer-token')
        .expect((res) => {
          expect([200, 202]).toContain(res.status);
        });

      expect(response.body).toEqual(
        expect.objectContaining({
          status: 'cancellation_in_progress',
          jobId: expect.anything(),
        }),
      );
    });

    it('should reject non-organizer users', async () => {
      const eventId = 'event-id';

      await request(app.getHttpServer())
        .patch(`/events/${eventId}/cancel`)
        .set('Authorization', 'Bearer non-organizer-token')
        .expect(403);
    });

    it('should return 409 for already cancelled events', async () => {
      const eventId = 'already-cancelled-event';

      await request(app.getHttpServer())
        .patch(`/events/${eventId}/cancel`)
        .set('Authorization', 'Bearer organizer-token')
        .expect(409);
    });
  });

  describe('GET /events/:id/cancellation-status', () => {
    it('should return queued job status', async () => {
      const eventId = 'event-id';

      const response = await request(app.getHttpServer())
        .get(`/events/${eventId}/cancellation-status`)
        .set('Authorization', 'Bearer organizer-token')
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          jobId: expect.anything(),
          state: expect.any(String),
        }),
      );
    });
  });

  describe('Refund workflow', () => {
    it('should trigger refund processing asynchronously', async () => {
      const eventId = 'event-id';

      await request(app.getHttpServer())
        .patch(`/events/${eventId}/cancel`)
        .set('Authorization', 'Bearer organizer-token');

      /**
       * If using Bull queues,
       * cancellation endpoint typically queues the job.
       *
       * Depending on your test environment,
       * you may either:
       * - execute processors synchronously
       * - manually invoke processor
       * - wait for queue completion
       */

      expect(mockRefundService.refundEvent).toHaveBeenCalledTimes(1);

      expect(mockRefundService.refundEvent).toHaveBeenCalledWith(
        eventId,
      );
    });
  });
});