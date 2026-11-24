import { Test, TestingModule } from '@nestjs/testing';
import {
  ClassSerializerInterceptor,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as request from 'supertest';
import { App } from 'supertest/types';

import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/users/enums/user-role.enum';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';

const USER_ID = '11111111-1111-1111-1111-111111111111';

/** Columns that must never appear in a serialized user response. */
const SENSITIVE_FIELDS = [
  'passwordHash',
  'googleId',
  'emailVerificationToken',
  'emailVerificationTokenExpiresAt',
  'mfaConfig',
  'mfaSessions',
];

function buildUser(): User {
  const user = new User();
  user.id = USER_ID;
  user.email = 'me@example.com';
  user.displayName = 'Test User';
  user.role = UserRole.EVENT_GOER;
  user.passwordHash = 'super-secret-hash';
  user.googleId = 'google-oauth-id';
  user.emailVerificationToken = 'verify-me';
  user.emailVerificationTokenExpiresAt = new Date();
  user.mfaConfig = {
    enabled: true,
    method: 'totp',
    totpSecret: 'JBSWY3DPEHPK3PXP',
    phoneNumber: '+15550001111',
    backupCodes: ['backup-code-1'],
  };
  user.mfaSessions = [
    {
      sessionId: 'session-1',
      createdAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
      method: 'totp',
    },
  ];
  return user;
}

describe('Users sensitive-field exposure (e2e) — #1373', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const usersService = {
      findById: jest.fn().mockResolvedValue(buildUser()),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const request = context.switchToHttp().getRequest();
          request.user = { id: USER_ID, role: UserRole.ADMIN };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    // Mirrors the global interceptor registered in AppModule.
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /users/me excludes sensitive fields', async () => {
    const res = await request(app.getHttpServer()).get('/users/me').expect(200);

    expect(res.body.id).toBe(USER_ID);
    for (const field of SENSITIVE_FIELDS) {
      expect(res.body).not.toHaveProperty(field);
    }
  });

  it('GET /users/:id excludes sensitive fields', async () => {
    const res = await request(app.getHttpServer())
      .get(`/users/${USER_ID}`)
      .expect(200);

    expect(res.body.id).toBe(USER_ID);
    for (const field of SENSITIVE_FIELDS) {
      expect(res.body).not.toHaveProperty(field);
    }
  });

  it('GET /users/:id rejects a non-UUID id with 400', async () => {
    await request(app.getHttpServer())
      .get('/users/not-a-uuid')
      .expect(400);
  });
});
