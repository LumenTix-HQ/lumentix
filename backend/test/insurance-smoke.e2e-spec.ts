/**
 * Smoke tests for InsuranceModule.
 *
 * Boot the full application and assert that the insurance routes are
 * registered and return non-404 responses, confirming the module is
 * correctly wired into AppModule.
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from './helpers/test-app.helper';
import { clearDatabase } from './helpers/db.helper';

describe('InsuranceModule smoke tests (e2e)', () => {
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

  it('GET /insurance/products — module is wired (returns 200, not 404)', async () => {
    const res = await request(app.getHttpServer())
      .get('/insurance/products')
      .expect(200);

    // Returns a paginated envelope
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });

  it('GET /insurance/products/compare — module is wired (returns 200 for empty query)', async () => {
    // productIds is required — omitting it should give 400 (not 404)
    const res = await request(app.getHttpServer())
      .get('/insurance/products/compare')
      .expect(400);

    // 400 proves the route exists; 404 would mean the module is not wired
    expect(res.status).not.toBe(404);
  });

  it('POST /insurance/insurers/register — requires authentication (returns 401, not 404)', async () => {
    await request(app.getHttpServer())
      .post('/insurance/insurers/register')
      .send({ companyName: 'Test Co', licenseNumber: 'LIC-001' })
      .expect(401);
  });
});
