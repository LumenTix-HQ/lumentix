import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { WalletType } from '@/types/wallet';

const wallet = {
  isConnected: true,
  publicKey: 'GABC',
  isLoading: false,
  error: null as string | null,
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(),
};

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: () => wallet,
}));

import { useStellarWallet } from '@/hooks/useStellarWallet';

describe('useStellarWallet', () => {
  beforeEach(() => {
    wallet.connect = vi.fn(async () => {});
    wallet.disconnect = vi.fn();
  });

  it('exposes wallet state from context', () => {
    const { result } = renderHook(() => useStellarWallet());
    expect(result.current.isConnected).toBe(true);
    expect(result.current.publicKey).toBe('GABC');
  });

  it('connectWallet connects via Freighter', async () => {
    const { result } = renderHook(() => useStellarWallet());
    await act(async () => {
      await result.current.connectWallet();
    });
    expect(wallet.connect).toHaveBeenCalledWith(WalletType.FREIGHTER);
  });

  it('disconnectWallet delegates to context disconnect', () => {
    const { result } = renderHook(() => useStellarWallet());
    act(() => result.current.disconnectWallet());
    expect(wallet.disconnect).toHaveBeenCalled();
  });
});
