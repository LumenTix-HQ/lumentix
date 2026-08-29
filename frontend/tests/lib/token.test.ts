import { describe, it, expect } from 'vitest';
import { decodeJwtPayload, decodeJwtRole, isTokenExpired } from '@/lib/auth/token';

// Build a JWT-shaped string (header.payload.signature) with a base64url payload.
function makeToken(payload: Record<string, unknown>): string {
  const b64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${b64}.signature`;
}

const nowSec = Math.floor(Date.now() / 1000);

describe('decodeJwtPayload', () => {
  it('decodes a well-formed payload', () => {
    const token = makeToken({ sub: 'u1', role: 'admin', exp: nowSec + 100 });
    expect(decodeJwtPayload(token)).toMatchObject({ sub: 'u1', role: 'admin' });
  });

  it('returns null for a token without three segments', () => {
    expect(decodeJwtPayload('only.two')).toBeNull();
    expect(decodeJwtPayload('notatoken')).toBeNull();
  });

  it('returns null for non-JSON payloads', () => {
    expect(decodeJwtPayload('header.@@@notbase64json@@@.sig')).toBeNull();
  });
});

describe('decodeJwtRole', () => {
  it('extracts the role claim', () => {
    expect(decodeJwtRole(makeToken({ role: 'organizer', exp: nowSec + 10 }))).toBe('organizer');
  });

  it('returns an empty string when role is missing', () => {
    expect(decodeJwtRole(makeToken({ sub: 'u1', exp: nowSec + 10 }))).toBe('');
  });

  it('returns an empty string for a malformed token', () => {
    expect(decodeJwtRole('garbage')).toBe('');
  });
});

describe('isTokenExpired', () => {
  it('is false for a token expiring in the future', () => {
    expect(isTokenExpired(makeToken({ exp: nowSec + 3600 }))).toBe(false);
  });

  it('is true for a token expired in the past', () => {
    expect(isTokenExpired(makeToken({ exp: nowSec - 10 }))).toBe(true);
  });

  it('is true when the exp claim is missing', () => {
    expect(isTokenExpired(makeToken({ role: 'admin' }))).toBe(true);
  });

  it('is true for a malformed token', () => {
    expect(isTokenExpired('not.a.jwt.token')).toBe(true);
  });
});
