import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import middleware, { config } from '@/middleware';

const ACCESS_TOKEN_COOKIE = 'lumentix_access_token';

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64');
}

/** Builds an unsigned JWT - middleware only reads the payload, it never verifies. */
function buildToken(payload: Record<string, unknown>): string {
  return [encodeSegment({ alg: 'HS256', typ: 'JWT' }), encodeSegment(payload), 'signature'].join(
    '.',
  );
}

function tokenFor(role: string, secondsUntilExpiry = 3600): string {
  return buildToken({ role, exp: Math.floor(Date.now() / 1000) + secondsUntilExpiry });
}

function buildRequest(pathname: string, token?: string): NextRequest {
  const headers = new Headers();
  if (token) {
    headers.set('cookie', `${ACCESS_TOKEN_COOKIE}=${token}`);
  }
  return new NextRequest(`https://lumentix.test${pathname}`, { headers });
}

describe('middleware', () => {
  describe('authentication redirect', () => {
    it('redirects to login when no token is present', () => {
      const res = middleware(buildRequest('/create'));
      const location = new URL(res.headers.get('location') as string);

      expect(res.status).toBe(307);
      expect(location.pathname).toBe('/login');
    });

    it('preserves the requested path as the redirect param', () => {
      const res = middleware(buildRequest('/my-tickets'));
      const location = new URL(res.headers.get('location') as string);

      expect(location.searchParams.get('redirect')).toBe('/my-tickets');
    });

    it('redirects to login when the token is expired', () => {
      const res = middleware(buildRequest('/profile', tokenFor('attendee', -60)));
      const location = new URL(res.headers.get('location') as string);

      expect(res.status).toBe(307);
      expect(location.pathname).toBe('/login');
    });

    it('redirects to login when the token is malformed', () => {
      const res = middleware(buildRequest('/profile', 'not-a-jwt'));
      const location = new URL(res.headers.get('location') as string);

      expect(location.pathname).toBe('/login');
    });

    it('redirects to login when the token has no exp claim', () => {
      const res = middleware(buildRequest('/profile', buildToken({ role: 'attendee' })));
      const location = new URL(res.headers.get('location') as string);

      expect(location.pathname).toBe('/login');
    });

    it('allows a valid token through to a non-role-guarded route', () => {
      const res = middleware(buildRequest('/profile', tokenFor('attendee')));

      expect(res.headers.get('location')).toBeNull();
      expect(res.headers.get('x-middleware-next')).toBe('1');
    });
  });

  describe('organizer role guard', () => {
    it('allows an organizer through to /organizer', () => {
      const res = middleware(buildRequest('/organizer/dashboard', tokenFor('organizer')));

      expect(res.headers.get('location')).toBeNull();
      expect(res.headers.get('x-middleware-next')).toBe('1');
    });

    it('allows an admin through to /organizer', () => {
      const res = middleware(buildRequest('/organizer/dashboard', tokenFor('admin')));

      expect(res.headers.get('x-middleware-next')).toBe('1');
    });

    it('redirects a non-organizer away from /organizer', () => {
      const res = middleware(buildRequest('/organizer/dashboard', tokenFor('attendee')));
      const location = new URL(res.headers.get('location') as string);

      expect(res.status).toBe(307);
      expect(location.pathname).toBe('/');
      expect(location.searchParams.has('redirect')).toBe(false);
    });
  });

  describe('admin role guard', () => {
    it('allows an admin through to /admin', () => {
      const res = middleware(buildRequest('/admin/users', tokenFor('admin')));

      expect(res.headers.get('x-middleware-next')).toBe('1');
    });

    it('redirects an organizer away from /admin', () => {
      const res = middleware(buildRequest('/admin/users', tokenFor('organizer')));
      const location = new URL(res.headers.get('location') as string);

      expect(location.pathname).toBe('/');
    });
  });

  describe('matcher coverage (#1622)', () => {
    it('lists every auth-only and organizer-only route in the matcher', () => {
      expect(config.matcher).toEqual(
        expect.arrayContaining([
          '/my-payments',
          '/reviews',
          '/scheduling',
          '/gamification',
          '/insurance',
          '/resale',
          '/events/:id/analytics',
          '/venues/:eventId/capacity',
        ]),
      );
    });

    const authOnlyPaths = [
      '/my-payments',
      '/reviews',
      '/scheduling',
      '/gamification',
      '/insurance',
      '/resale',
    ];

    const organizerOnlyPaths = ['/events/evt-1/analytics', '/venues/venue-1/capacity'];

    it.each([...authOnlyPaths, ...organizerOnlyPaths])(
      'redirects anonymous visitors from %s to login',
      (pathname) => {
        const res = middleware(buildRequest(pathname));
        const location = new URL(res.headers.get('location') as string);

        expect(res.status).toBe(307);
        expect(location.pathname).toBe('/login');
        expect(location.searchParams.get('redirect')).toBe(pathname);
      },
    );

    it.each(authOnlyPaths)('allows a signed-in attendee through %s', (pathname) => {
      const res = middleware(buildRequest(pathname, tokenFor('attendee')));

      expect(res.headers.get('x-middleware-next')).toBe('1');
    });

    it.each(organizerOnlyPaths)('allows an organizer through %s', (pathname) => {
      const res = middleware(buildRequest(pathname, tokenFor('organizer')));

      expect(res.headers.get('x-middleware-next')).toBe('1');
    });

    it.each(organizerOnlyPaths)('allows an admin through %s', (pathname) => {
      const res = middleware(buildRequest(pathname, tokenFor('admin')));

      expect(res.headers.get('x-middleware-next')).toBe('1');
    });

    it.each(organizerOnlyPaths)('redirects an attendee away from %s', (pathname) => {
      const res = middleware(buildRequest(pathname, tokenFor('attendee')));
      const location = new URL(res.headers.get('location') as string);

      expect(res.status).toBe(307);
      expect(location.pathname).toBe('/');
    });
  });
});
