import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';

import { RecommendationsController } from '../src/recommendations/recommendations.controller';
import { RecommendationsService } from '../src/recommendations/recommendations.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';

const USER_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_ID = '33333333-3333-3333-3333-333333333333';

/**
 * Stand-in for JwtAuthGuard that rejects anonymous callers and attaches the
 * caller to the request. `Bearer admin` acts as an admin principal.
 */
const authGuard = {
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header) {
      throw new UnauthorizedException();
    }
    req.user = {
      id: USER_ID,
      role: header.includes('admin') ? 'ADMIN' : 'EVENT_GOER',
    };
    return true;
  },
};

describe('Recommendations authorization (e2e) — #1372', () => {
  let app: INestApplication<App>;
  const service = {
    generateRecommendations: jest.fn().mockResolvedValue({
      userId: USER_ID,
      recommendations: [],
      generatedAt: new Date().toISOString(),
    }),
    updateUserPreferences: jest
      .fn()
      .mockResolvedValue({ userId: USER_ID, saved: 1 }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RecommendationsController],
      providers: [{ provide: RecommendationsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /recommendations/me rejects anonymous callers', async () => {
    await request(app.getHttpServer())
      .get('/recommendations/me')
      .expect(401);
  });

  it('GET /recommendations/me scopes results to the caller', async () => {
    await request(app.getHttpServer())
      .get('/recommendations/me')
      .set('Authorization', 'Bearer user-token')
      .expect(200);

    expect(service.generateRecommendations).toHaveBeenCalledWith(USER_ID, 5);
  });

  it('PUT /recommendations/me/preferences scopes writes to the caller', async () => {
    await request(app.getHttpServer())
      .put('/recommendations/me/preferences')
      .set('Authorization', 'Bearer user-token')
      .send({ preferences: [{ category: 'Technology', weight: 50 }] })
      .expect(200);

    expect(service.updateUserPreferences).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ preferences: expect.any(Array) }),
    );
  });

  it('GET /recommendations/:userId forbids non-admins', async () => {
    await request(app.getHttpServer())
      .get(`/recommendations/${OTHER_ID}`)
      .set('Authorization', 'Bearer user-token')
      .expect(403);
  });

  it('GET /recommendations/:userId allows admins to target another user', async () => {
    await request(app.getHttpServer())
      .get(`/recommendations/${OTHER_ID}`)
      .set('Authorization', 'Bearer admin-token')
      .expect(200);

    expect(service.generateRecommendations).toHaveBeenCalledWith(OTHER_ID, 5);
  });
});
