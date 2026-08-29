import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/lib/auth/auth', () => ({ getAccessToken: vi.fn(() => 'tok') }));
import { getAccessToken } from '@/lib/auth/auth';
import { useEventAnalytics } from '@/hooks/useEventAnalytics';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
beforeEach(() => {
  (getAccessToken as unknown as ReturnType<typeof vi.fn>).mockReturnValue('tok');
});

describe('useEventAnalytics', () => {
  it('does not fetch when eventId is null', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useEventAnalytics(null));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.totalRevenue).toBe(0);
  });

  it('loads analytics (happy path)', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ totalRevenue: 1200, confirmedCount: 8, refundedCount: 1, revenueHistory: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ expected: 1000, actual: 900 }) }),
    );
    const { result } = renderHook(() => useEventAnalytics('e1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.totalRevenue).toBe(1200);
    expect(result.current.confirmedCount).toBe(8);
  });

  it('sets an error when the request throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const { result } = renderHook(() => useEventAnalytics('e2'));
    await waitFor(() => expect(result.current.error).toBe('down'));
  });
});
