import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/lib/auth/auth', () => ({
  getAccessToken: vi.fn(() => 'token-123'),
}));

import { getAccessToken } from '@/lib/auth/auth';
import { useAttendees } from '@/hooks/useAttendees';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  (getAccessToken as unknown as ReturnType<typeof vi.fn>).mockReturnValue('token-123');
});

describe('useAttendees', () => {
  it('loads and normalizes registrations (happy path)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [
            { id: 'r1', name: 'Alice', email: 'a@b.com', createdAt: '2024-01-01', status: 'CONFIRMED' },
          ],
        }),
      })),
    );
    const { result } = renderHook(() => useAttendees('event-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]).toMatchObject({ id: 'r1', name: 'Alice', email: 'a@b.com' });
  });

  it('surfaces an error when the token is missing', async () => {
    (getAccessToken as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { result } = renderHook(() => useAttendees('event-1'));
    await waitFor(() => expect(result.current.error).toMatch(/access token/i));
  });

  it('surfaces an error on a failed response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ message: 'boom' }) })),
    );
    const { result } = renderHook(() => useAttendees('event-2'));
    await waitFor(() => expect(result.current.error).toBe('boom'));
  });
});
