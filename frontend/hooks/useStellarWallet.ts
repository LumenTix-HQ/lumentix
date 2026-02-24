'use client';

import { useWallet } from '@/contexts/WalletContext';

export function useStellarWallet() {
  const {
    isConnected,
    publicKey,
    balance,
    isLoading,
    error,
    connectWallet,
    disconnectWallet,
    getBalance,
  } = useWallet();

  return {
    isConnected,
    publicKey,
    balance,
    isLoading,
    error,
    connectWallet,
    disconnectWallet,
    getBalance,
  };
}
