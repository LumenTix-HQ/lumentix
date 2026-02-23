import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import {
  TypeOrmHealthIndicator,
  HealthCheckError,
} from '@nestjs/terminus';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from '../src/health/health.module';
import { StellarService } from '../src/stellar/stellar.service';

describe('Health (e2e)', () => {
  describe('GET /health', () => {
    it('when healthy returns 200', async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true }), HealthModule],
      })
        .overrideProvider(TypeOrmHealthIndicator)
        .useValue({
          pingCheck: () =>
            Promise.resolve({ database: { status: 'up' } }),
        })
        .overrideProvider(StellarService)
        .useValue({
          checkConnectivity: () => Promise.resolve(),
        })
        .compile();

      const app: INestApplication<App> = moduleFixture.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.info).toBeDefined();
      expect(res.body.info.database).toBeDefined();
      expect(res.body.info.database.status).toBe('up');
      expect(res.body.info.stellar).toBeDefined();
      expect(res.body.info.stellar.status).toBe('up');

      await app.close();
    });

    it('when DB is down returns 503', async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true }), HealthModule],
      })
        .overrideProvider(TypeOrmHealthIndicator)
        .useValue({
          pingCheck: () =>
            Promise.reject(
              new HealthCheckError('Database check failed', {
                database: { status: 'down', message: 'Connection refused' },
              }),
            ),
        })
        .compile();

      const app: INestApplication<App> = moduleFixture.createNestApplication();
      await app.init();

      await request(app.getHttpServer()).get('/health').expect(503);

      await app.close();
    });
  });
});
