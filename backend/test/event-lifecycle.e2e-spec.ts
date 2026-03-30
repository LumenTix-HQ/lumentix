import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from './helpers/test-app.helper';
import { registerAndLogin } from './helpers/auth.helper';
import { clearDatabase } from './helpers/db.helper';

describe('Event Lifecycle (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

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

  it('should complete the full event lifecycle: draft → published → cancelled', async () => {
    // ── Step 1 & 2: Register and login as organizer ──────────────────────
    const { token } = await registerAndLogin(app, 'organizer');

    // ── Step 3: Create event as DRAFT ────────────────────────────────────
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const createRes = await request(app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'E2E Test Event',
        description: 'A test event for e2e lifecycle testing',
        location: 'Test City',
        startDate: futureStart,
        endDate: futureEnd,
        ticketPrice: 10,
        currency: 'XLM',
        maxAttendees: 100,
      })
      .expect(201);

    const eventId: string = createRes.body.id;
    expect(eventId).toBeDefined();
    expect(createRes.body.status).toBe('draft');
    expect(createRes.body.title).toBe('E2E Test Event');

    // ── Step 4: Publish event (draft → published) ────────────────────────
    const publishRes = await request(app.getHttpServer())
      .put(`/events/${eventId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'published' })
      .expect(200);

    expect(publishRes.body.status).toBe('published');

    // ── Step 5: Verify event is PUBLISHED via GET ────────────────────────
    const getPublishedRes = await request(app.getHttpServer())
      .get(`/events/${eventId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(getPublishedRes.body.id).toBe(eventId);
    expect(getPublishedRes.body.status).toBe('published');

    // ── Step 6: Cancel event (published → cancelled) ─────────────────────
    const cancelRes = await request(app.getHttpServer())
      .put(`/events/${eventId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'cancelled' })
      .expect(200);

    expect(cancelRes.body.status).toBe('cancelled');

    // ── Step 7: Verify event is CANCELLED via GET ────────────────────────
    const getCancelledRes = await request(app.getHttpServer())
      .get(`/events/${eventId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(getCancelledRes.body.id).toBe(eventId);
    expect(getCancelledRes.body.status).toBe('cancelled');
  });

  it('should reject invalid status transitions', async () => {
    const { token } = await registerAndLogin(app, 'organizer');

    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    // Create a draft event
    const createRes = await request(app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Invalid Transition Event',
        startDate: futureStart,
        endDate: futureEnd,
        ticketPrice: 5,
        currency: 'XLM',
      })
      .expect(201);

    const eventId = createRes.body.id;

    // Attempt draft → cancelled (invalid — must go through published first)
    await request(app.getHttpServer())
      .put(`/events/${eventId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'cancelled' })
      .expect(400);

    // Attempt draft → completed (invalid)
    await request(app.getHttpServer())
      .put(`/events/${eventId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'completed' })
      .expect(400);
  });

  it('should prevent non-owner from updating an event', async () => {
    const organizer1 = await registerAndLogin(app, 'organizer');
    const organizer2 = await registerAndLogin(app, 'organizer');

    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    // Organizer 1 creates the event
    const createRes = await request(app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${organizer1.token}`)
      .send({
        title: 'Ownership Test Event',
        startDate: futureStart,
        endDate: futureEnd,
      })
      .expect(201);

    const eventId = createRes.body.id;

    // Organizer 2 attempts to update it — should be forbidden
    await request(app.getHttpServer())
      .put(`/events/${eventId}`)
      .set('Authorization', `Bearer ${organizer2.token}`)
      .send({ status: 'published' })
      .expect(403);
  });
});
