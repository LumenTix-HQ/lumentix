import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.location
const mockLocation = { href: '' };
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockLocation.href = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Token Management', () => {
    it('should include access token in request headers when available', async () => {
      localStorage.setItem('lumentix_access_token', 'test-token-123');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      });

      await apiGet('/test-endpoint');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
          }),
        })
      );
    });

    it('should not include authorization header when no token', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      });

      await apiGet('/test-endpoint');

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1]?.headers || {};
      expect(headers).not.toHaveProperty('Authorization');
    });
  });

  describe('Token Refresh', () => {
    it('should refresh token on 401 response and retry request', async () => {
      localStorage.setItem('lumentix_access_token', 'expired-token');
      localStorage.setItem('lumentix_refresh_token', 'refresh-token-123');

      // First call returns 401
      // Second call (after refresh) succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'new-token', refresh_token: 'new-refresh' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: 'success' }),
        });

      const result = await apiGet('/test-endpoint');

      expect(result).toEqual({ data: 'success' });
      // Should have called fetch 3 times: original, refresh, retry
      expect(mockFetch).toHaveBeenCalledTimes(3);
      // Verify new tokens were stored
      expect(localStorage.getItem('lumentix_access_token')).toBe('new-token');
    });

    it('should redirect to login when refresh fails', async () => {
      localStorage.setItem('lumentix_access_token', 'expired-token');
      localStorage.setItem('lumentix_refresh_token', 'invalid-refresh');

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        });

      await expect(apiGet('/test-endpoint')).rejects.toThrow('Session expired');

      expect(mockLocation.href).toBe('/login');
      expect(localStorage.getItem('lumentix_access_token')).toBeNull();
      expect(localStorage.getItem('lumentix_refresh_token')).toBeNull();
    });

    it('should not retry if request already failed once', async () => {
      localStorage.setItem('lumentix_access_token', 'test-token');

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      await expect(apiGet('/test-endpoint')).rejects.toThrow('Session expired');

      // Should only call twice: original + refresh (not retry)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should throw error with message for non-ok responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request'),
      });

      await expect(apiGet('/test-endpoint')).rejects.toThrow('API error 400: Bad request');
    });

    it('should handle 204 no content response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
      });

      const result = await apiGet('/test-endpoint');
      expect(result).toBeNull();
    });

    it('should parse JSON response for successful requests', async () => {
      const mockData = { id: 1, name: 'Test' };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      });

      const result = await apiGet('/test-endpoint');
      expect(result).toEqual(mockData);
    });
  });

  describe('HTTP Methods', () => {
    it('should make GET request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ method: 'GET' }),
      });

      const result = await apiGet('/test');
      expect(result).toEqual({ method: 'GET' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should make POST request with body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ method: 'POST' }),
      });

      const body = { name: 'Test Item' };
      const result = await apiPost('/test', body);

      expect(result).toEqual({ method: 'POST' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
        })
      );
    });

    it('should make PATCH request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ method: 'PATCH' }),
      });

      const body = { id: 1, name: 'Updated' };
      const result = await apiPatch('/test/1', body);

      expect(result).toEqual({ method: 'PATCH' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test/1'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(body),
        })
      );
    });

    it('should make DELETE request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ method: 'DELETE' }),
      });

      const result = await apiDelete('/test/1');

      expect(result).toEqual({ method: 'DELETE' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test/1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('Request Configuration', () => {
    it('should use correct API base URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await apiGet('/test');

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('/test');
    });

    it('should set Content-Type header by default', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await apiGet('/test');

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should merge custom headers with default headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await apiGet('/test');

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers).toHaveProperty('Content-Type');
    });
  });
});
