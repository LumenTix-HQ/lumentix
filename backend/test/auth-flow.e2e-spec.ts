import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../src/auth/auth.module';
import { UsersModule } from '../src/users/users.module';
import { TypeOrmModule } from '@nestjs/typeorm';

describe('Auth Flow (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST ?? 'localhost',
          port: parseInt(process.env.DB_PORT ?? '5432', 10),
          username: process.env.DB_USERNAME ?? 'postgres',
          password: process.env.DB_PASSWORD ?? 'postgres',
          database: process.env.DB_NAME ?? 'lumentix_test',
          autoLoadEntities: true,
          synchronize: true,
        }),
        AuthModule,
        UsersModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('POST /auth/register', () => {
    it('registers a new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'e2e-auth-test@example.com',
          password: 'Test1234!',
          displayName: 'E2E Test User',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.email).toBe('e2e-auth-test@example.com');
    });

    it('rejects duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'e2e-auth-test@example.com',
          password: 'Test1234!',
          displayName: 'E2E Test User',
        })
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    it('returns JWT tokens on valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'e2e-auth-test@example.com', password: 'Test1234!' })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('rejects invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'e2e-auth-test@example.com', password: 'WrongPassword' })
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('returns new tokens on valid refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      accessToken = res.body.accessToken;
    });
  });

  describe('GET /auth/me', () => {
    it('returns current user profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id');
      expect(res.body.email).toBe('e2e-auth-test@example.com');
    });

    it('rejects unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('invalidates refresh token', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);
    });
  });

  describe('POST /auth/wallet-challenge', () => {
    it('returns a signing challenge', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/wallet-challenge')
        .send({ publicKey: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' })
        .expect(200);

      expect(res.body).toHaveProperty('nonce');
    });
  });

  describe('DTO whitelist enforcement', () => {
    it('rejects requests with unexpected fields', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'e2e-whitelist@example.com',
          password: 'Test1234!',
          displayName: 'Whitelist Test',
          evilField: 'should be rejected',
        })
        .expect(400);
    });
  });
});
