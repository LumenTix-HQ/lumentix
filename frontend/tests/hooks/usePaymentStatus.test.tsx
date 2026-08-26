import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import usePaymentStatus, { getBackoffDelay } from '@/hooks/usePaymentStatus';

describe('getBackoffDelay', () => {
  it('grows exponentially and caps at maxDelay', () => {
    expect(getBackoffDelay(0, 3000, 30000)).toBe(3000);
    expect(getBackoffDelay(1, 3000, 30000)).toBe(6000);
    expect(getBackoffDelay(2, 3000, 30000)).toBe(12000);
    expect(getBackoffDelay(3, 3000, 30000)).toBe(24000);
    expect(getBackoffDelay(4, 3000, 30000)).toBe(30000);
    expect(getBackoffDelay(10, 3000, 30000)).toBe(30000);
  });
});

describe('usePaymentStatus', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ status: 'PENDING' }) })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stops polling and reports timedOut after maxAttempts (never terminal)', async () => {
    const { result } = renderHook(() =>
      usePaymentStatus('pay-1', { maxAttempts: 3, baseDelayMs: 2, maxDelayMs: 8 }),
    );

    await waitFor(() => expect(result.current.timedOut).toBe(true), { timeout: 2000 });

    expect(result.current.isPolling).toBe(false);
    // 1 immediate poll + 3 scheduled attempts = 4 fetches, then it stops.
    const callCount = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callCount).toBe(4);
  });

  it('stops polling immediately on a terminal status without timing out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ status: 'CONFIRMED' }) })),
    );

    const { result } = renderHook(() =>
      usePaymentStatus('pay-2', { maxAttempts: 5, baseDelayMs: 2, maxDelayMs: 8 }),
    );

    await waitFor(() => expect(result.current.status).toBe('CONFIRMED'));
    expect(result.current.timedOut).toBe(false);
    expect(result.current.isPolling).toBe(false);
  });

  it('does nothing when paymentId is null', () => {
    const { result } = renderHook(() => usePaymentStatus(null));
    expect(result.current.status).toBeNull();
    expect(result.current.isPolling).toBe(false);
  });
});
