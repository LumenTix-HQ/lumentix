import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import usePaymentStatus from '@/hooks/usePaymentStatus';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('usePaymentStatus', () => {
  it('does nothing when paymentId is null', () => {
    const { result } = renderHook(() => usePaymentStatus(null));
    expect(result.current.status).toBeNull();
  });

  it('fetches and exposes the payment status (happy path)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ status: 'CONFIRMED' }) })),
    );
    const { result } = renderHook(() => usePaymentStatus('pay-1'));
    await waitFor(() => expect(result.current.status).toBe('CONFIRMED'));
  });

  it('ignores transient fetch errors without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    const { result } = renderHook(() => usePaymentStatus('pay-2'));
    // status stays null; the hook swallows the error
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.status).toBeNull();
  });
});
