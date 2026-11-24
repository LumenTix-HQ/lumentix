import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/logout/route';

function buildRequest(cookies: Record<string, string> = {}): NextRequest {
  const headers = new Headers();
  const cookieHeader = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  if (cookieHeader) headers.set('cookie', cookieHeader);

  return new NextRequest('https://lumentix.test/api/auth/logout', {
    method: 'POST',
    headers,
  });
}

function setCookieHeader(res: Response): string {
  return res.headers.get('set-cookie') ?? '';
}

describe('POST /api/auth/logout', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('revokes the refresh token at the backend with the bearer access token, then clears cookies', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Logged out' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const res = await POST(
      buildRequest({
        lumentix_access_token: 'access-1',
        lumentix_refresh_token: 'refresh-1',
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('/auth/logout');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
    expect(JSON.parse(init.body as string)).toEqual({ refreshToken: 'refresh-1' });

    expect(res.status).toBe(200);
    const cookies = setCookieHeader(res);
    expect(cookies).toContain('lumentix_access_token=');
    expect(cookies).toContain('lumentix_refresh_token=');
  });

  it('clears the cookies even when the backend revocation fails', async () => {
    fetchMock.mockRejectedValue(new Error('backend down'));

    const res = await POST(
      buildRequest({
        lumentix_access_token: 'access-1',
        lumentix_refresh_token: 'refresh-1',
      }),
    );

    expect(res.status).toBe(200);
    const cookies = setCookieHeader(res);
    expect(cookies).toContain('lumentix_access_token=');
    expect(cookies).toContain('lumentix_refresh_token=');
  });

  it('does not call the backend when there is no session to revoke', async () => {
    const res = await POST(buildRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(setCookieHeader(res)).toContain('lumentix_access_token=');
  });
});
