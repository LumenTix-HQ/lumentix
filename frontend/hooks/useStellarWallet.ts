'use client';

import { useWallet } from '@/contexts/WalletContext';
import { WalletType } from '@/types/wallet';

export function useStellarWallet() {
  const {
    isConnected,
    publicKey,
    isLoading,
    error,
    connect,
    disconnect,
  } = useWallet();

  const connectWallet = async () => {
    await connect(WalletType.FREIGHTER);
  };

  const disconnectWallet = () => {
    disconnect();
  };

  return {
    isConnected,
    publicKey,
    isLoading,
    error,
    connectWallet,
    disconnectWallet,
    connect,
    disconnect,
  };
}
