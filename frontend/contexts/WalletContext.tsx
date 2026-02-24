'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { WalletContextType, WalletState, WalletType, NetworkType } from '@/types/wallet';
import { connectFreighter, FreighterError, isFreighterAvailable } from '@/lib/stellar/freighter';
import {
  saveWalletData,
  getStoredWalletData,
  clearWalletData,
} from '@/lib/stellar/wallet-utils';

const initialState: WalletState = {
  isConnected: false,
  publicKey: null,
  walletType: null,
  network: NetworkType.TESTNET,
  isLoading: false,
  error: null,
};

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<WalletState>(initialState);

  // Restore wallet connection on mount
  useEffect(() => {
    const restoreConnection = async () => {
      const stored = getStoredWalletData();
      if (!stored) return;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        if (stored.walletType === WalletType.FREIGHTER) {
          // Check if Freighter is available
          const available = await isFreighterAvailable();
          if (!available) {
            clearWalletData();
            setState(initialState);
            return;
          }

          const publicKey = await connectFreighter(stored.network);
          
          if (publicKey === stored.publicKey) {
            setState({
              isConnected: true,
              publicKey,
              walletType: WalletType.FREIGHTER,
              network: stored.network,
              isLoading: false,
              error: null,
            });
          } else {
            // Public key changed, clear stored data
            clearWalletData();
            setState(initialState);
          }
        }
      } catch (error) {
        // Silent fail on restore - user can reconnect manually
        clearWalletData();
        setState(initialState);
      }
    };

    restoreConnection();
  }, []);

  const connect = useCallback(async (walletType: WalletType) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      let publicKey: string;

      switch (walletType) {
        case WalletType.FREIGHTER:
          publicKey = await connectFreighter(state.network);
          break;
        
        case WalletType.LOBSTR:
          throw new Error('LOBSTR integration coming soon');
        
        case WalletType.WALLET_CONNECT:
          throw new Error('WalletConnect integration coming soon');
        
        default:
          throw new Error(`Unsupported wallet type: ${walletType}`);
      }

      const newState: WalletState = {
        isConnected: true,
        publicKey,
        walletType,
        network: state.network,
        isLoading: false,
        error: null,
      };

      setState(newState);
      
      // Persist connection
      saveWalletData({
        walletType,
        publicKey,
        network: state.network,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect wallet';
      
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      
      throw error;
    }
  }, [state.network]);

  const disconnect = useCallback(() => {
    clearWalletData();
    setState(initialState);
  }, []);

  const switchNetwork = useCallback(async (network: NetworkType) => {
    if (!state.isConnected || !state.walletType) {
      setState((prev) => ({ ...prev, network }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      let publicKey: string;

      if (state.walletType === WalletType.FREIGHTER) {
        publicKey = await connectFreighter(network);
      } else {
        throw new Error('Network switching not supported for this wallet');
      }

      const newState: WalletState = {
        ...state,
        publicKey,
        network,
        isLoading: false,
        error: null,
      };

      setState(newState);
      
      saveWalletData({
        walletType: state.walletType,
        publicKey,
        network,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to switch network';
      
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      
      throw error;
    }
  }, [state]);

  const value: WalletContextType = {
    ...state,
    connect,
    disconnect,
    switchNetwork,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
