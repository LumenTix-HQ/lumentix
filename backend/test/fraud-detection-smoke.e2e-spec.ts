/**
 * Smoke tests for FraudDetectionModule (#1124).
 *
 * Boot the full application and assert the fraud-detection routes are
 * registered and that their role guards accept the (lowercase) roles the JWT
 * strategy attaches to req.user.
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from './helpers/test-app.helper';
import { clearDatabase } from './helpers/db.helper';
import { registerAndLogin } from './helpers/auth.helper';

describe('FraudDetectionModule smoke tests (e2e)', () => {
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

  it('GET /fraud-detection/flagged-transactions — requires authentication (401, not 404)', async () => {
    await request(app.getHttpServer())
      .get('/fraud-detection/flagged-transactions')
      .expect(401);
  });

  it('GET /fraud-detection/flagged-transactions — rejects attendees (403)', async () => {
    const { token } = await registerAndLogin(app, 'attendee');

    await request(app.getHttpServer())
      .get('/fraud-detection/flagged-transactions')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('GET /fraud-detection/flagged-transactions — admin gets a paginated list', async () => {
    const { token } = await registerAndLogin(app, 'admin');

    const res = await request(app.getHttpServer())
      .get('/fraud-detection/flagged-transactions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });

  it('POST /fraud-detection/calculate-risk-score — organizer can score a trade', async () => {
    const { token } = await registerAndLogin(app, 'organizer');

    const res = await request(app.getHttpServer())
      .post('/fraud-detection/calculate-risk-score')
      .set('Authorization', `Bearer ${token}`)
      .send({
        originalPrice: 100,
        salePrice: 300,
        timeSincePurchaseMinutes: 10,
        buyerTransactionCount: 1,
        isNewAccount: true,
      })
      .expect(200);

    expect(res.body.riskScore).toBeGreaterThan(0);
    expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(res.body.riskLevel);
  });

  it('GET /fraud-detection/flagged-transactions/:id — unknown id returns 404', async () => {
    const { token } = await registerAndLogin(app, 'admin');

    await request(app.getHttpServer())
      .get(
        '/fraud-detection/flagged-transactions/00000000-0000-4000-8000-000000000000',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
