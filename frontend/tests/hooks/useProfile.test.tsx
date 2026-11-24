import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const useAuth = vi.fn();
const getMe = vi.fn();
const patchMe = vi.fn();
const patchPreferences = vi.fn();
const deactivateAccount = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuth(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getMe: (...a: unknown[]) => getMe(...a),
    patchMe: (...a: unknown[]) => patchMe(...a),
    patchPreferences: (...a: unknown[]) => patchPreferences(...a),
    deactivateAccount: (...a: unknown[]) => deactivateAccount(...a),
  },
}));

// eslint-disable-next-line import/first
import { useProfile } from '@/hooks/useProfile';

const PROFILE = {
  id: 'u1',
  email: 'user@example.com',
  displayName: 'Ada',
  walletAddress: null,
  emailOptOut: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('useProfile (#1395)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    getMe.mockResolvedValue({ ...PROFILE });
    patchMe.mockResolvedValue({ id: 'u1', displayName: 'Grace' });
    patchPreferences.mockResolvedValue({ emailOptOut: true });
    deactivateAccount.mockResolvedValue(null);
  });

  describe('fetching', () => {
    it('fetches the profile via the cookie-authenticated client, with no token argument', async () => {
      const { result } = renderHook(() => useProfile());

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(getMe).toHaveBeenCalledWith();
      expect(result.current.profile).toEqual(PROFILE);
      expect(result.current.error).toBeNull();
    });

    it('maps the backend stellarPublicKey onto walletAddress', async () => {
      getMe.mockResolvedValue({
        ...PROFILE,
        walletAddress: null,
        stellarPublicKey: 'GTESTPUBLICKEY',
      });
      const { result } = renderHook(() => useProfile());

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.profile?.walletAddress).toBe('GTESTPUBLICKEY');
    });

    it('does not fetch while unauthenticated', async () => {
      useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
      const { result } = renderHook(() => useProfile());

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(getMe).not.toHaveBeenCalled();
      expect(result.current.profile).toBeNull();
    });

    it('waits for the auth session to resolve before fetching', () => {
      useAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });
      const { result } = renderHook(() => useProfile());

      expect(result.current.isLoading).toBe(true);
      expect(getMe).not.toHaveBeenCalled();
    });

    it('surfaces a fetch failure', async () => {
      getMe.mockRejectedValue(new Error('Network down'));
      const { result } = renderHook(() => useProfile());

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.error).toBe('Network down');
      expect(result.current.profile).toBeNull();
    });
  });

  describe('updating', () => {
    it('updates the display name without a token argument', async () => {
      const { result } = renderHook(() => useProfile());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.updateDisplayName('Grace');
      });

      expect(patchMe).toHaveBeenCalledWith({ displayName: 'Grace' });
      expect(result.current.profile?.displayName).toBe('Grace');
    });

    it('updates the email opt-out preference without a token argument', async () => {
      const { result } = renderHook(() => useProfile());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.updateEmailOptOut(true);
      });

      expect(patchPreferences).toHaveBeenCalledWith({ emailOptOut: true });
      expect(result.current.profile?.emailOptOut).toBe(true);
    });
  });

  describe('deactivating', () => {
    it('deactivates the account without a token argument', async () => {
      const { result } = renderHook(() => useProfile());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.deactivateAccount();
      });

      expect(deactivateAccount).toHaveBeenCalledWith();
    });
  });
});
