import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithRetry } from '@/lib/api-client';

function okResponse() {
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as unknown as Response;
}
function serverErrorResponse() {
  return { ok: false, status: 503, json: async () => ({}), text: async () => 'err' } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchWithRetry', () => {
  it('retries a transient network failure then succeeds transparently', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network error'))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchWithRetry('/api/proxy/events', { method: 'GET' }, { baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a 5xx response then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(serverErrorResponse())
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchWithRetry('/api/proxy/events', {}, { baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retry budget and surfaces the error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network error'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchWithRetry('/api/proxy/events', { method: 'GET' }, { maxRetries: 2, baseDelayMs: 1 }),
    ).rejects.toThrow(/network error/);
    // 1 initial + 2 retries = 3 attempts
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-idempotent (POST) requests', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network error'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchWithRetry('/api/proxy/events', { method: 'POST' }, { baseDelayMs: 1 }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
