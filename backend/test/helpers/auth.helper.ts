import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

let counter = 0;

/**
 * Maps friendly role names used in tests to the UserRole enum values
 * expected by the RegisterDto (@IsEnum(UserRole)).
 *
 * UserRole enum:  EVENT_GOER | ORGANIZER | SPONSOR | ADMIN
 * Role decorator: attendee   | organizer | sponsor | admin  (lowercase)
 */
const ROLE_MAP: Record<string, string> = {
  organizer: 'ORGANIZER',
  sponsor: 'SPONSOR',
  attendee: 'EVENT_GOER',
  event_goer: 'EVENT_GOER',
  admin: 'ADMIN',
};

/**
 * Register a new user with the given role and return a JWT + userId.
 * Each call generates a unique email to avoid ConflictException.
 *
 * @param role Friendly role name: 'organizer', 'sponsor', 'attendee', 'admin'
 */
export async function registerAndLogin(
  app: INestApplication,
  role: string,
): Promise<{ token: string; userId: string }> {
  const email = `e2e_${role.toLowerCase()}_${Date.now()}_${++counter}@test.com`;
  const password = 'TestPass123!';
  const userRole = ROLE_MAP[role.toLowerCase()] ?? role;

  // Register
  const registerRes = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password, role: userRole })
    .expect(201);

  const token: string = registerRes.body.access_token;

  // Decode JWT payload to extract userId (sub)
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64').toString(),
  );

  return { token, userId: payload.sub };
}
