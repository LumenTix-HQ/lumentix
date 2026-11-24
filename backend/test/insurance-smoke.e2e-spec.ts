/**
 * Smoke tests for InsuranceModule.
 *
 * Boot the full application and assert that the insurance routes are
 * registered. Every route is behind JwtAuthGuard, so unauthenticated
 * requests must return 401 (a 404 would mean the module is not wired).
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

  it('GET /insurance/pool — requires authentication (401, not 404)', async () => {
    await request(app.getHttpServer()).get('/insurance/pool').expect(401);
  });

  it('GET /insurance/me — requires authentication (401, not 404)', async () => {
    await request(app.getHttpServer()).get('/insurance/me').expect(401);
  });

  it('POST /insurance/purchase — requires authentication (401, not 404)', async () => {
    await request(app.getHttpServer())
      .post('/insurance/purchase')
      .send({ ticketId: '00000000-0000-4000-8000-000000000000' })
      .expect(401);
  });

  it('POST /insurance/claim — requires authentication (401, not 404)', async () => {
    await request(app.getHttpServer())
      .post('/insurance/claim')
      .send({ ticketId: '00000000-0000-4000-8000-000000000000', cancellationReason: 'OTHER' })
      .expect(401);
  });
});
