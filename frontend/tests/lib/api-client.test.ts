import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiGet, apiPost, apiPatch, apiDelete, apiRequest } from '@/lib/api-client';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.location
const mockLocation = { href: '' };
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

const ok = (body: unknown = {}) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
});

describe('API Client (cookie + proxy auth model)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation.href = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Proxy requests', () => {
    it('sends requests to /api/proxy/* with a JSON Content-Type and no Authorization header', async () => {
      mockFetch.mockResolvedValue(ok({ data: 'test' }));

      await apiGet('/test-endpoint');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/proxy/test-endpoint');
      expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(init.headers).not.toHaveProperty('Authorization');
    });
  });

  describe('Session refresh', () => {
    it('refreshes through POST /api/auth/refresh on 401 and retries the request', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockResolvedValueOnce({ ok: true, status: 200 })
        .mockResolvedValueOnce(ok({ data: 'success' }));

      const result = await apiGet('/test-endpoint');

      expect(result).toEqual({ data: 'success' });
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls[0][0]).toBe('/api/proxy/test-endpoint');
      expect(mockFetch.mock.calls[1][0]).toBe('/api/auth/refresh');
      expect(mockFetch.mock.calls[1][1]).toEqual({ method: 'POST' });
      expect(mockFetch.mock.calls[2][0]).toBe('/api/proxy/test-endpoint');
    });

    it('redirects to /login and throws a 401 ApiProxyError when the refresh fails', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockResolvedValueOnce({ ok: false, status: 401 });

      const error = await apiGet('/test-endpoint').catch((err: unknown) => err);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe('ApiProxyError');
      expect((error as { status: number }).status).toBe(401);
      expect((error as Error).message).toContain('Session expired');
      expect(mockLocation.href).toBe('/login');
    });

    it('does not retry a second time when the retried request is still unauthorized', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockResolvedValueOnce({ ok: true, status: 200 })
        .mockResolvedValueOnce({ ok: false, status: 401 });

      await expect(apiGet('/test-endpoint')).rejects.toThrow('Session expired');

      // original, refresh, retry (not refreshed again)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error Handling', () => {
    it("throws the backend `message` as-is and exposes the status", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify({ message: 'Bad request' })),
      });

      const error = await apiGet('/test-endpoint').catch((err: unknown) => err);

      expect((error as Error).message).toBe('Bad request');
      expect((error as { status: number }).status).toBe(400);
    });

    it('uses the first element when the backend message is an array', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify({ message: ['email must be an email', 'password too short'] })),
      });

      await expect(apiGet('/test-endpoint')).rejects.toThrow('email must be an email');
    });

    it('falls back to the raw body when the error response is not JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        text: () => Promise.resolve('Bad gateway'),
      });

      const error = await apiPost('/test-endpoint', {}).catch((err: unknown) => err);

      expect((error as Error).message).toBe('Bad gateway');
      expect((error as { status: number }).status).toBe(502);
    });

    it('should handle 204 no content response', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 204 });

      const result = await apiGet('/test-endpoint');
      expect(result).toBeNull();
    });

    it('should parse JSON response for successful requests', async () => {
      const mockData = { id: 1, name: 'Test' };
      mockFetch.mockResolvedValue(ok(mockData));

      const result = await apiGet('/test-endpoint');
      expect(result).toEqual(mockData);
    });
  });

  describe('HTTP Methods', () => {
    it('should make GET request', async () => {
      mockFetch.mockResolvedValue(ok({ method: 'GET' }));

      const result = await apiGet('/test');
      expect(result).toEqual({ method: 'GET' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should make POST request with body', async () => {
      mockFetch.mockResolvedValue(ok({ method: 'POST' }));

      const body = { name: 'Test Item' };
      const result = await apiPost('/test', body);

      expect(result).toEqual({ method: 'POST' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify(body) }),
      );
    });

    it('should make PATCH request', async () => {
      mockFetch.mockResolvedValue(ok({ method: 'PATCH' }));

      const body = { id: 1, name: 'Updated' };
      const result = await apiPatch('/test/1', body);

      expect(result).toEqual({ method: 'PATCH' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test/1'),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify(body) }),
      );
    });

    it('should make DELETE request', async () => {
      mockFetch.mockResolvedValue(ok({ method: 'DELETE' }));

      const result = await apiDelete('/test/1');

      expect(result).toEqual({ method: 'DELETE' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test/1'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('Request Configuration', () => {
    it('keeps the default Content-Type when the caller supplies other headers', async () => {
      mockFetch.mockResolvedValue(ok());

      await apiRequest('/test', { headers: { 'X-Custom': '1' } });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers).toEqual({ 'Content-Type': 'application/json', 'X-Custom': '1' });
    });

    it('lets a caller-supplied header override the default Content-Type', async () => {
      mockFetch.mockResolvedValue(ok());

      await apiRequest('/test', { headers: { 'Content-Type': 'text/plain' } });

      expect(mockFetch.mock.calls[0][1].headers['Content-Type']).toBe('text/plain');
    });
  });
});
