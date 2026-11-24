/**
 * Smoke tests for PassPackagesModule (#1124).
 *
 * Boot the full application and assert the pass-package routes are registered,
 * role-gated correctly, and that GET /pass-packages/my-passes is not swallowed
 * by GET /pass-packages/:id.
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from './helpers/test-app.helper';
import { clearDatabase } from './helpers/db.helper';
import { registerAndLogin } from './helpers/auth.helper';

describe('PassPackagesModule smoke tests (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const validPackage = () => ({
    name: 'E2E Season Pass',
    description: 'Any 1 of the included events',
    price: 25,
    eventsAllowed: 1,
    totalEvents: 1,
    eventIds: [],
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

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

  it('GET /pass-packages — public list is wired (200, not 404)', async () => {
    const res = await request(app.getHttpServer())
      .get('/pass-packages')
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });

  it('GET /pass-packages/my-passes — resolves to the my-passes route, not :id', async () => {
    const { token } = await registerAndLogin(app, 'attendee');

    const res = await request(app.getHttpServer())
      .get('/pass-packages/my-passes')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual(expect.objectContaining({ data: [], total: 0 }));
  });

  it('POST /pass-packages — rejects attendees (403)', async () => {
    const { token } = await registerAndLogin(app, 'attendee');

    await request(app.getHttpServer())
      .post('/pass-packages')
      .set('Authorization', `Bearer ${token}`)
      .send(validPackage())
      .expect(403);
  });

  it('POST /pass-packages — organizer creates a package that is then listed and fetchable', async () => {
    const { token, userId } = await registerAndLogin(app, 'organizer');

    const createRes = await request(app.getHttpServer())
      .post('/pass-packages')
      .set('Authorization', `Bearer ${token}`)
      .send(validPackage())
      .expect(201);

    expect(createRes.body.createdBy).toBe(userId);

    await request(app.getHttpServer())
      .get(`/pass-packages/${createRes.body.id}`)
      .expect(200);

    const listRes = await request(app.getHttpServer())
      .get('/pass-packages')
      .expect(200);
    expect(listRes.body.total).toBe(1);
  });

  it('DELETE /pass-packages/:id — soft-deleted packages drop out of the list', async () => {
    const { token } = await registerAndLogin(app, 'organizer');

    const { body: created } = await request(app.getHttpServer())
      .post('/pass-packages')
      .set('Authorization', `Bearer ${token}`)
      .send(validPackage())
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/pass-packages/${created.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const listRes = await request(app.getHttpServer())
      .get('/pass-packages')
      .expect(200);
    expect(listRes.body.total).toBe(0);
  });
});
