/**
 * AuditController e2e: the admin audit endpoints are registered and admin-only.
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from './helpers/test-app.helper';
import { registerAndLogin } from './helpers/auth.helper';
import { clearDatabase } from './helpers/db.helper';

describe('AuditController (e2e)', () => {
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

  it('GET /admin/audit — requires authentication (401, not 404)', async () => {
    await request(app.getHttpServer()).get('/admin/audit').expect(401);
  });

  it('GET /admin/audit — forbidden for organizers (403)', async () => {
    const { token } = await registerAndLogin(app, 'organizer');

    await request(app.getHttpServer())
      .get('/admin/audit')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('GET /admin/audit/export — forbidden for organizers (403)', async () => {
    const { token } = await registerAndLogin(app, 'organizer');

    await request(app.getHttpServer())
      .get('/admin/audit/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('GET /admin/audit — admins get a paginated list', async () => {
    const { token } = await registerAndLogin(app, 'admin');

    const res = await request(app.getHttpServer())
      .get('/admin/audit')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /admin/audit/export — admins get a CSV download', async () => {
    const { token } = await registerAndLogin(app, 'admin');

    const res = await request(app.getHttpServer())
      .get('/admin/audit/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
  });
});
