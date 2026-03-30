import { useState, useCallback } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { WalletType } from '@/types/wallet';

export const useWalletConnection = () => {
  const wallet = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const connectWallet = useCallback(async (walletType: WalletType) => {
    setIsConnecting(true);
    setConnectionError(null);

    try {
      await wallet.connect(walletType);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect wallet';
      setConnectionError(message);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [wallet]);

  const disconnectWallet = useCallback(() => {
    wallet.disconnect();
    setConnectionError(null);
  }, [wallet]);

  const clearError = useCallback(() => {
    setConnectionError(null);
  }, []);

  return {
    ...wallet,
    isConnecting,
    connectionError,
    connectWallet,
    disconnectWallet,
    clearError,
  };
};
