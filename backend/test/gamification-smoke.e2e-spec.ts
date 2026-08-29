/**
 * Smoke tests for GamificationModule.
 *
 * Boot the full application and assert that the gamification routes are
 * registered and return non-404 responses, confirming the module is
 * correctly wired into AppModule.
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from './helpers/test-app.helper';
import { registerAndLogin } from './helpers/auth.helper';
import { clearDatabase } from './helpers/db.helper';

describe('GamificationModule smoke tests (e2e)', () => {
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

  it('GET /gamification/badges — module is wired (returns 200, not 404)', async () => {
    const res = await request(app.getHttpServer())
      .get('/gamification/badges')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /gamification/leaderboard — module is wired (returns 200, not 404)', async () => {
    const res = await request(app.getHttpServer())
      .get('/gamification/leaderboard')
      .expect(200);

    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('period');
  });

  it('GET /gamification/profile/me — requires authentication (returns 401, not 404)', async () => {
    await request(app.getHttpServer())
      .get('/gamification/profile/me')
      .expect(401);
  });

  it('GET /gamification/profile/me — authenticated user gets an empty profile', async () => {
    const { token, userId } = await registerAndLogin(app, 'attendee');

    const res = await request(app.getHttpServer())
      .get('/gamification/profile/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('userId', userId);
    expect(res.body).toHaveProperty('xp', 0);
    expect(Array.isArray(res.body.badges)).toBe(true);
    expect(res.body.badges).toHaveLength(0);
  });

  it('POST /gamification/badges — admin can create a badge definition', async () => {
    const { token } = await registerAndLogin(app, 'admin');

    const res = await request(app.getHttpServer())
      .post('/gamification/badges')
      .set('Authorization', `Bearer ${token}`)
      .send({
        key: 'first_event',
        name: 'First Event',
        description: 'Attended your first event',
        xpReward: 100,
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.key).toBe('first_event');
    expect(res.body.xpReward).toBe(100);

    // Badge should now appear in the public list
    const listRes = await request(app.getHttpServer())
      .get('/gamification/badges')
      .expect(200);

    expect(listRes.body.length).toBeGreaterThanOrEqual(1);
    expect(listRes.body.some((b: { key: string }) => b.key === 'first_event')).toBe(true);
  });
});
