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

  const initiateWalletConnect = useCallback(
    async (network?: any) => {
      if (!wallet.initiate_wallet_connect) {
        throw new Error('WalletConnect is not supported in the current context');
      }
      return wallet.initiate_wallet_connect(network);
    },
    [wallet],
  );

  const approveWalletSession = useCallback(
    async (proposalOrApproval?: any) => {
      if (!wallet.approve_wallet_session) {
        throw new Error('WalletConnect approval is not supported in the current context');
      }
      return wallet.approve_wallet_session(proposalOrApproval);
    },
    [wallet],
  );

  const disconnectWalletConnect = useCallback(
    async (topic?: string) => {
      if (wallet.disconnect_wallet) {
        await wallet.disconnect_wallet(topic);
      } else {
        wallet.disconnect();
      }
    },
    [wallet],
  );

  return {
    ...wallet,
    isConnecting,
    connectionError,
    connectWallet,
    disconnectWallet,
    clearError,
    initiate_wallet_connect: initiateWalletConnect,
    approve_wallet_session: approveWalletSession,
    disconnect_wallet: disconnectWalletConnect,
    initiateWalletConnect,
    approveWalletSession,
    disconnectWalletConnect,
  };
};
