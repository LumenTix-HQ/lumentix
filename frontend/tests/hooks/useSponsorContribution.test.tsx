import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { signTransaction } from '@stellar/freighter-api';

const useWallet = vi.fn();
const initiateSponsorship = vi.fn();
const confirmSponsorship = vi.fn();
const getSponsorEvent = vi.fn();

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: (...a: unknown[]) => useWallet(...a),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    initiateSponsorship: (...a: unknown[]) => initiateSponsorship(...a),
    confirmSponsorship: (...a: unknown[]) => confirmSponsorship(...a),
    getSponsorEvent: (...a: unknown[]) => getSponsorEvent(...a),
  },
}));

// eslint-disable-next-line import/first
import { useSponsorContribution } from '@/hooks/useSponsorContribution';
import { NetworkType } from '@/types/wallet';

const tier = {
  id: 'tier-1',
  name: 'Gold',
  minAmount: 500,
  currency: 'XLM',
};

describe('useSponsorContribution (#1170)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWallet.mockReturnValue({
      publicKey: 'GABC…',
      network: NetworkType.TESTNET,
    });
    initiateSponsorship.mockResolvedValue({ xdr: 'AAAA…', contributionId: 'c-1' });
    confirmSponsorship.mockResolvedValue({ rank: 1, transactionHash: '0xhash' });
    vi.mocked(signTransaction).mockResolvedValue('signed-xdr');
  });

  it('routes initiation and confirmation through the shared api client', async () => {
    const { result } = renderHook(() => useSponsorContribution('evt-1'));

    await act(async () => {
      await result.current.contribute(tier, 600, 'Acme', 'https://cdn.example.com/a.png');
    });

    expect(initiateSponsorship).toHaveBeenCalledWith('evt-1', {
      tierId: 'tier-1',
      amount: 600,
      displayName: 'Acme',
      logoUrl: 'https://cdn.example.com/a.png',
      sponsorPublicKey: 'GABC…',
    });
    expect(signTransaction).toHaveBeenCalledWith('AAAA…', {
      networkPassphrase: 'Test SDF Network ; September 2015',
      accountToSign: 'GABC…',
    });
    expect(confirmSponsorship).toHaveBeenCalledWith('c-1', 'signed-xdr');
    expect(result.current.status).toBe('confirmed');
    expect(result.current.result).toEqual({
      rank: 1,
      transactionHash: '0xhash',
      contributionId: 'c-1',
    });
  });

  it('carries a backend failure into a failed status', async () => {
    initiateSponsorship.mockRejectedValue(new Error('Sponsorship service unavailable'));
    const { result } = renderHook(() => useSponsorContribution('evt-1'));

    await act(async () => {
      await result.current.contribute(tier, 600);
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('Sponsorship service unavailable');
  });

  it('enforces the tier minimum locally before calling the api', async () => {
    const { result } = renderHook(() => useSponsorContribution('evt-1'));

    await act(async () => {
      await result.current.contribute(tier, 10);
    });

    expect(initiateSponsorship).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('Minimum contribution is 500 XLM');
  });
});