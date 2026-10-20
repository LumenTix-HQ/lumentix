import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/proxy/[...path]/route';

const ACCESS_TOKEN_COOKIE = 'lumentix_access_token';

function buildRequest(
  url: string,
  init: { cookies?: Record<string, string>; method?: string; body?: string } = {},
): NextRequest {
  const headers = new Headers();
  const cookies = init.cookies ?? {};
  const cookieHeader = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  if (cookieHeader) headers.set('cookie', cookieHeader);
  if (init.body) headers.set('content-type', 'application/json');

  return new NextRequest(url, {
    method: init.method ?? 'GET',
    headers,
    body: init.body,
  });
}

const paramsFor = (path: string[]) => ({ params: Promise.resolve({ path }) });

describe('api/proxy route', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards to the configured backend origin with the query string', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const request = buildRequest(
      'https://lumentix.test/api/proxy/payments/history?page=2&limit=20',
      { cookies: { [ACCESS_TOKEN_COOKIE]: 'token-123' } },
    );

    const res = await GET(request, paramsFor(['payments', 'history']));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(
      'http://localhost:3000/payments/history?page=2&limit=20',
    );
    expect(
      (calledInit.headers as Headers).get('authorization'),
    ).toBe('Bearer token-123');
  });

  it('rejects a path segment that tries to smuggle in a scheme', async () => {
    const request = buildRequest(
      'https://lumentix.test/api/proxy/https%3A/evil.com/steal',
    );

    const res = await GET(request, paramsFor(['https:', 'evil.com', 'steal']));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a segment that starts with a slash', async () => {
    const request = buildRequest('https://lumentix.test/api/proxy//etc/passwd');

    const res = await GET(request, paramsFor(['/etc', 'passwd']));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to proxy /internal/* routes', async () => {
    const request = buildRequest(
      'https://lumentix.test/api/proxy/internal/health',
      { cookies: { [ACCESS_TOKEN_COOKIE]: 'token-123' } },
    );

    const res = await POST(request, paramsFor(['internal', 'health']));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('percent-encodes path segments', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));

    const request = buildRequest('https://lumentix.test/api/proxy/events/a%20b');

    await GET(request, paramsFor(['events', 'a b']));

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:3000/events/a%20b',
    );
  });

  it('forwards the upstream Content-Type instead of forcing application/json', async () => {
    fetchMock.mockResolvedValue(
      new Response('BEGIN:VCALENDAR', {
        status: 200,
        headers: { 'content-type': 'text/calendar' },
      }),
    );

    const request = buildRequest('https://lumentix.test/api/proxy/events/1/ical');

    const res = await GET(request, paramsFor(['events', '1', 'ical']));

    expect(res.headers.get('content-type')).toBe('text/calendar');
  });

  it('forwards Content-Disposition for downloads', async () => {
    fetchMock.mockResolvedValue(
      new Response('a,b,c', {
        status: 200,
        headers: {
          'content-type': 'text/csv',
          'content-disposition': 'attachment; filename="report.csv"',
        },
      }),
    );

    const request = buildRequest('https://lumentix.test/api/proxy/reports/export');

    const res = await GET(request, paramsFor(['reports', 'export']));

    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="report.csv"',
    );
  });
});
