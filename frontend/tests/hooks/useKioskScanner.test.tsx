import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useKioskScanner } from '@/hooks/useKioskScanner';

describe('useKioskScanner', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('posts scanned qrData to /api/proxy/tickets/verify-qr', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        ticketId: 't1',
        eventId: 'e1',
        attendeeName: 'Ada Lovelace',
        attendeeEmail: 'ada@example.com',
        ticketType: 'general',
      }),
    });

    const { result } = renderHook(() => useKioskScanner());

    await act(async () => {
      await result.current.submitScan('{"ticketId":"t1","signature":"sig"}');
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/proxy/tickets/verify-qr',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ qrData: '{"ticketId":"t1","signature":"sig"}' }),
      }),
    );
    expect(result.current.result).toEqual(
      expect.objectContaining({ outcome: 'success', attendeeName: 'Ada Lovelace' }),
    );
  });

  it('surfaces the backend error message on a failed verification', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Ticket has already been checked in' }),
    });

    const { result } = renderHook(() => useKioskScanner());

    await act(async () => {
      await result.current.submitScan('bad-qr-payload');
    });

    expect(result.current.result).toEqual({
      outcome: 'error',
      message: 'Ticket has already been checked in',
    });
  });

  it('shows a network-error message when the request throws', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useKioskScanner());

    await act(async () => {
      await result.current.submitScan('some-qr-payload');
    });

    expect(result.current.result?.outcome).toBe('error');
  });

  it('ignores an empty scan', async () => {
    const { result } = renderHook(() => useKioskScanner());

    await act(async () => {
      await result.current.submitScan('   ');
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.result).toBeNull();
  });

  it('auto-clears the result after a delay', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ticketId: 't1' }),
    });

    const { result } = renderHook(() => useKioskScanner());

    await act(async () => {
      await result.current.submitScan('payload');
    });
    expect(result.current.result).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    await waitFor(() => expect(result.current.result).toBeNull());
  });

  it('dismissResult clears the result immediately', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ticketId: 't1' }),
    });

    const { result } = renderHook(() => useKioskScanner());

    await act(async () => {
      await result.current.submitScan('payload');
    });
    expect(result.current.result).not.toBeNull();

    act(() => {
      result.current.dismissResult();
    });
    expect(result.current.result).toBeNull();
  });
});
