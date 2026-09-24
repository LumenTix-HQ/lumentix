/**
 * Smoke tests for the event-readiness TestingModule (#1126).
 *
 * Boot the full application and exercise POST /testing/events/:eventId/lifecycle
 * through JwtAuthGuard + RolesGuard. The production gate (NonProductionGuard)
 * is covered by its unit spec, since NODE_ENV is fixed when the app boots.
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from './helpers/test-app.helper';
import { clearDatabase } from './helpers/db.helper';
import { registerAndLogin } from './helpers/auth.helper';

describe('TestingModule smoke tests (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const futureStart = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const futureEnd = new Date(
    Date.now() + 8 * 24 * 60 * 60 * 1000,
  ).toISOString();

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    dataSource = testApp.dataSource;
  });

  beforeEach(async () => {
    await clearDatabase(dataSource);
  });

  afterAll(async () => {
    await clearDatabase(dataSource);
    await app.close();
  });

  const lifecycleUrl = (eventId: string) =>
    `/testing/events/${eventId}/lifecycle`;
  const unknownEventId = '00000000-0000-4000-8000-000000000000';

  it('requires authentication (401, not 404)', async () => {
    await request(app.getHttpServer())
      .post(lifecycleUrl(unknownEventId))
      .expect(401);
  });

  it('rejects attendees (403)', async () => {
    const { token } = await registerAndLogin(app, 'attendee');

    await request(app.getHttpServer())
      .post(lifecycleUrl(unknownEventId))
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('rejects a non-UUID event id (400)', async () => {
    const { token } = await registerAndLogin(app, 'organizer');

    await request(app.getHttpServer())
      .post(lifecycleUrl('not-a-uuid'))
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('runs for an organizer and restores the event status afterwards', async () => {
    const { token } = await registerAndLogin(app, 'organizer');

    const { body: event } = await request(app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Readiness Check Event',
        startDate: futureStart,
        endDate: futureEnd,
        ticketPrice: 10,
        currency: 'XLM',
      })
      .expect(201);
    expect(event.status).toBe('draft');

    const res = await request(app.getHttpServer())
      .post(lifecycleUrl(event.id))
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(Array.isArray(res.body.results)).toBe(true);
    expect(
      res.body.results.map((r: { testName: string }) => r.testName),
    ).toEqual(expect.arrayContaining(['transition_draft_to_published']));
    expect(res.body.summary.totalTests).toBeGreaterThan(0);

    const { body: after } = await request(app.getHttpServer())
      .get(`/events/${event.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.status).toBe('draft');
  });
});
