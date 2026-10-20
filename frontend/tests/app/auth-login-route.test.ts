import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/login/route';

const SAME_ORIGIN = 'https://lumentix.test';

function buildRequest(
  init: {
    origin?: string;
    contentType?: string;
    secFetchSite?: string;
    body?: string;
  } = {},
): NextRequest {
  const headers = new Headers();
  if (init.contentType) headers.set('content-type', init.contentType);
  if (init.origin) headers.set('origin', init.origin);
  if (init.secFetchSite) headers.set('sec-fetch-site', init.secFetchSite);

  return new NextRequest(`${SAME_ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers,
    body: init.body ?? JSON.stringify({ email: 'a@b.c', password: 'pw' }),
  });
}

function setCookieHeader(res: Response): string {
  return res.headers.get('set-cookie') ?? '';
}

describe('POST /api/auth/login', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ignores caller-supplied tokens instead of setting them as cookies', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid credentials' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const request = buildRequest({
      origin: SAME_ORIGIN,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'attacker-access',
        refreshToken: 'attacker-refresh',
      }),
    });

    const res = await POST(request);

    expect(res.status).toBe(401);
    expect(setCookieHeader(res)).not.toContain('attacker-access');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a cross-origin text/plain POST without setting cookies', async () => {
    const request = buildRequest({
      origin: 'https://evil.example',
      contentType: 'text/plain',
      body: JSON.stringify({ email: 'a@b.c', password: 'pw' }),
    });

    const res = await POST(request);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(setCookieHeader(res)).not.toContain('lumentix_access_token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a cross-site fetch (Sec-Fetch-Site) even without Origin', async () => {
    const request = buildRequest({
      contentType: 'application/json',
      secFetchSite: 'cross-site',
    });

    const res = await POST(request);

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-JSON content type', async () => {
    const request = buildRequest({
      origin: SAME_ORIGIN,
      contentType: 'application/x-www-form-urlencoded',
    });

    const res = await POST(request);

    expect(res.status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sets cookies from the backend response on a valid same-origin login', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'backend-access',
          refreshToken: 'backend-refresh',
          user: { id: 'u1' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const request = buildRequest({
      origin: SAME_ORIGIN,
      contentType: 'application/json',
      secFetchSite: 'same-origin',
    });

    const res = await POST(request);

    expect(res.status).toBe(200);
    const cookies = setCookieHeader(res);
    expect(cookies).toContain('lumentix_access_token=backend-access');
    expect(cookies).toContain('lumentix_refresh_token=backend-refresh');
  });
});
