/**
 * Smoke tests for ReviewsModule.
 *
 * These tests boot the full application and assert that the reviews routes
 * are registered and return non-404 responses, confirming the module is
 * correctly wired into AppModule.
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from './helpers/test-app.helper';
import { clearDatabase } from './helpers/db.helper';

describe('ReviewsModule smoke tests (e2e)', () => {
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

  it('GET /reviews — module is wired (returns 200, not 404)', async () => {
    const res = await request(app.getHttpServer()).get('/reviews').expect(200);

    // Should return a paginated envelope
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });

  it('GET /reviews/summary — module is wired (returns 200 with rating data)', async () => {
    const res = await request(app.getHttpServer())
      .get('/reviews/summary')
      .query({ reviewableType: 'EVENT', reviewableId: '00000000-0000-0000-0000-000000000001' })
      .expect(200);

    expect(res.body).toHaveProperty('averageRating');
    expect(res.body).toHaveProperty('totalReviews');
    expect(res.body.totalReviews).toBe(0);
  });

  it('POST /reviews — requires authentication (returns 401, not 404)', async () => {
    // No token → 401 Unauthorized, confirming the route exists
    await request(app.getHttpServer())
      .post('/reviews')
      .send({
        reviewableType: 'EVENT',
        reviewableId: '00000000-0000-0000-0000-000000000001',
        rating: 5,
      })
      .expect(401);
  });
});
