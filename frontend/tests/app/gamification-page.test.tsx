import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const useAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => useAuth() }));

const apiClient = {
  getMyGamificationProfile: vi.fn(),
  getAllAchievements: vi.fn(),
  getMyAchievements: vi.fn(),
  getLeaderboard: vi.fn(),
  getActiveChallenges: vi.fn(),
  getMyChallenges: vi.fn(),
  joinChallenge: vi.fn(),
  recordActivity: vi.fn(),
};
vi.mock('@/lib/api-client', () => ({ apiClient }));

import GamificationPage from '@/app/gamification/page';

describe('Gamification page', () => {
  beforeEach(() => {
    useAuth.mockReset();
    Object.values(apiClient).forEach((fn) => fn.mockReset());
  });

  it('asks signed-out visitors to sign in without calling the API', async () => {
    useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

    render(<GamificationPage />);

    expect(await screen.findByText(/sign in to track your achievements/i)).toBeInTheDocument();
    expect(apiClient.getMyGamificationProfile).not.toHaveBeenCalled();
  });

  it('loads every section for a signed-in user using cookie auth (no token arguments)', async () => {
    useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    apiClient.getMyGamificationProfile.mockResolvedValue(null);
    apiClient.getAllAchievements.mockResolvedValue([]);
    apiClient.getMyAchievements.mockResolvedValue([]);
    apiClient.getLeaderboard.mockResolvedValue([]);
    apiClient.getActiveChallenges.mockResolvedValue([]);
    apiClient.getMyChallenges.mockResolvedValue([]);

    render(<GamificationPage />);

    await waitFor(() => expect(apiClient.getMyGamificationProfile).toHaveBeenCalledWith());
    expect(apiClient.getAllAchievements).toHaveBeenCalledWith();
    expect(apiClient.getLeaderboard).toHaveBeenCalledWith(expect.any(String), 50);
  });

  it('shows an error state when loading fails', async () => {
    useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    apiClient.getMyGamificationProfile.mockRejectedValue(new Error('profile down'));
    apiClient.getAllAchievements.mockResolvedValue([]);
    apiClient.getMyAchievements.mockResolvedValue([]);
    apiClient.getLeaderboard.mockResolvedValue([]);
    apiClient.getActiveChallenges.mockResolvedValue([]);
    apiClient.getMyChallenges.mockResolvedValue([]);

    render(<GamificationPage />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('profile down'));
  });
});
