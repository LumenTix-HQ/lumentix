import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const wallet = {
  isConnected: false,
  publicKey: null as string | null,
  network: 'testnet',
  balance: null as string | null,
  getBalance: vi.fn(),
};

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: () => wallet,
}));

import { useWalletBalance } from '@/hooks/useWalletBalance';

describe('useWalletBalance', () => {
  beforeEach(() => {
    wallet.isConnected = false;
    wallet.publicKey = null;
    wallet.balance = null;
    wallet.getBalance = vi.fn();
  });

  it('reports zero balance and insufficient funds when disconnected', () => {
    const { result } = renderHook(() => useWalletBalance());
    expect(result.current.balance).toBe(0);
    // required + fee + 0.5 reserve is always > 0 balance
    expect(result.current.hasInsufficientFunds(1)).toBe(true);
    expect(result.current.shortfall(1)).toBeGreaterThan(1);
  });

  it('syncs the balance from the wallet context', async () => {
    wallet.isConnected = true;
    wallet.publicKey = 'GABC';
    wallet.balance = '42.5';
    const { result } = renderHook(() => useWalletBalance());
    await waitFor(() => expect(result.current.balance).toBe(42.5));
    expect(result.current.hasInsufficientFunds(10)).toBe(false);
    expect(result.current.shortfall(10)).toBe(0);
  });
});
