import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const useAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => useAuth() }));

const apiClient = {
  getMyInsurancePolicies: vi.fn(),
  getInsurancePool: vi.fn(),
  purchaseInsurance: vi.fn(),
  fileInsuranceClaim: vi.fn(),
};
vi.mock('@/lib/api-client', () => ({ apiClient }));

import InsurancePage from '@/app/insurance/page';

describe('Insurance page', () => {
  beforeEach(() => {
    useAuth.mockReset();
    Object.values(apiClient).forEach((fn) => fn.mockReset());
  });

  it('asks signed-out visitors to sign in without calling the API', async () => {
    useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

    render(<InsurancePage />);

    expect(await screen.findByText(/sign in to manage insurance policies/i)).toBeInTheDocument();
    expect(apiClient.getMyInsurancePolicies).not.toHaveBeenCalled();
  });

  it('loads policies and pool stats for a signed-in user', async () => {
    useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    apiClient.getMyInsurancePolicies.mockResolvedValue([]);
    apiClient.getInsurancePool.mockResolvedValue({
      totalPolicies: 7,
      totalClaimsProcessed: 1,
      totalPremiumCollected: '12',
      totalClaimsPaid: '3',
    });

    render(<InsurancePage />);

    expect(await screen.findByText('Total Policies')).toBeInTheDocument();
    expect(apiClient.getMyInsurancePolicies).toHaveBeenCalledWith();
  });

  it('shows an error state when loading fails', async () => {
    useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    apiClient.getMyInsurancePolicies.mockRejectedValue(new Error('boom'));
    apiClient.getInsurancePool.mockResolvedValue(null);

    render(<InsurancePage />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('boom'));
  });
});
