/**
 * Smoke tests for VenuesModule.
 *
 * Boot the full application and assert that the venues routes are registered
 * and return non-404 responses, confirming the module is correctly wired
 * into AppModule.
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from './helpers/test-app.helper';
import { registerAndLogin } from './helpers/auth.helper';
import { clearDatabase } from './helpers/db.helper';

describe('VenuesModule smoke tests (e2e)', () => {
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

  it('GET /venues — module is wired (returns 200, not 404)', async () => {
    const res = await request(app.getHttpServer()).get('/venues').expect(200);

    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('total');
    expect(res.body.total).toBe(0);
  });

  it('POST /venues — requires authentication (returns 401, not 404)', async () => {
    await request(app.getHttpServer())
      .post('/venues')
      .send({ name: 'Test Hall', address: '1 Main St' })
      .expect(401);
  });

  it('POST /venues — organizer can create a venue', async () => {
    const { token } = await registerAndLogin(app, 'organizer');

    const res = await request(app.getHttpServer())
      .post('/venues')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Grand Exhibition Hall',
        address: '42 Conference Avenue, Tech City',
        city: 'Tech City',
        country: 'Testland',
        capacity: 500,
        amenities: ['WiFi', 'Parking', 'AV Equipment'],
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Grand Exhibition Hall');
    expect(res.body.status).toBe('ACTIVE');

    // GET /venues should now list the created venue
    const listRes = await request(app.getHttpServer()).get('/venues').expect(200);
    expect(listRes.body.total).toBe(1);
    expect(listRes.body.data[0].id).toBe(res.body.id);
  });
});
