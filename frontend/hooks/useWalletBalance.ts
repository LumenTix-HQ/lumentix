'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { NetworkType } from '@/types/wallet';

interface WalletBalanceInfo {
  balance: number;
  isLoading: boolean;
  error: string | null;
  refreshBalance: () => Promise<void>;
  hasInsufficientFunds: (requiredAmount: number) => boolean;
  shortfall: (requiredAmount: number) => number;
}

const HORIZON_URLS = {
  [NetworkType.TESTNET]: 'https://horizon-testnet.stellar.org',
  [NetworkType.MAINNET]: 'https://horizon.stellar.org',
};

// Estimated fee for a typical payment transaction in XLM
const ESTIMATED_FEE_XLM = 0.00001; // Base fee, very small on Stellar
const BASE_RESERVE_XLM = 0.5; // Minimum reserve for Stellar account

/**
 * Hook to fetch and manage wallet XLM balance
 * Automatically fetches balance when wallet connects
 */
export function useWalletBalance(): WalletBalanceInfo {
  const { isConnected, publicKey, network, balance: storedBalance, getBalance } = useWallet();
  const [balance, setBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch balance from Horizon
  const refreshBalance = useCallback(async () => {
    if (!isConnected || !publicKey) {
      setBalance(0);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use the existing getBalance from WalletContext if available
      if (getBalance) {
        await getBalance();
        // Balance will be updated in context, we'll read it via useEffect
        return;
      }

      // Fallback: fetch directly from Horizon
      const { Horizon } = await import('@stellar/stellar-sdk');
      const server = new Horizon.Server(HORIZON_URLS[network as NetworkType] || HORIZON_URLS[NetworkType.TESTNET]);
      const account = await server.loadAccount(publicKey);
      const xlmBalance = account.balances.find((b: any) => b.asset_type === 'native');
      const balanceStr = xlmBalance?.balance ?? '0';
      setBalance(parseFloat(balanceStr));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch balance';
      setError(message);
      setBalance(0);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, publicKey, network, getBalance]);

  // Sync with stored balance from context
  useEffect(() => {
    if (storedBalance !== null && storedBalance !== undefined) {
      setBalance(parseFloat(storedBalance));
    }
  }, [storedBalance]);

  // Auto-fetch balance when wallet connects
  useEffect(() => {
    if (isConnected && publicKey) {
      refreshBalance();
    } else {
      setBalance(0);
    }
  }, [isConnected, publicKey, refreshBalance]);

  // Check if balance is insufficient for required amount
  const hasInsufficientFunds = useCallback(
    (requiredAmount: number): boolean => {
      return balance < requiredAmount + ESTIMATED_FEE_XLM + BASE_RESERVE_XLM;
    },
    [balance],
  );

  // Calculate shortfall amount
  const shortfall = useCallback(
    (requiredAmount: number): number => {
      const required = requiredAmount + ESTIMATED_FEE_XLM + BASE_RESERVE_XLM;
      return Math.max(0, required - balance);
    },
    [balance],
  );

  return {
    balance,
    isLoading,
    error,
    refreshBalance,
    hasInsufficientFunds,
    shortfall,
  };
}

export default useWalletBalance;
