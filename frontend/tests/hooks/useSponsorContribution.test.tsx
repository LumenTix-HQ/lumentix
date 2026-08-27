import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const wallet = { publicKey: 'GABC' as string | null, network: 'testnet' };
vi.mock('@/contexts/WalletContext', () => ({ useWallet: () => wallet }));

import { useSponsorContribution } from '@/hooks/useSponsorContribution';

const tier = { id: 't1', name: 'Gold', minAmount: 100, currency: 'XLM' } as never;

describe('useSponsorContribution', () => {
  beforeEach(() => {
    wallet.publicKey = 'GABC';
  });

  it('starts in the idle state', () => {
    const { result } = renderHook(() => useSponsorContribution('e1'));
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('errors when the wallet is not connected', async () => {
    wallet.publicKey = null;
    const { result } = renderHook(() => useSponsorContribution('e1'));
    await act(async () => {
      await result.current.contribute(tier, 100);
    });
    expect(result.current.error).toBe('Wallet not connected');
  });

  it('errors when the amount is below the tier minimum', async () => {
    const { result } = renderHook(() => useSponsorContribution('e1'));
    await act(async () => {
      await result.current.contribute(tier, 50);
    });
    expect(result.current.error).toMatch(/Minimum contribution/);
  });

  it('reset() returns to idle and clears error', async () => {
    wallet.publicKey = null;
    const { result } = renderHook(() => useSponsorContribution('e1'));
    await act(async () => {
      await result.current.contribute(tier, 100);
    });
    expect(result.current.error).not.toBeNull();
    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });
});
