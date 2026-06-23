'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { WalletContextType, WalletState, WalletType, NetworkType } from '@/types/wallet';
import { connectFreighter, isFreighterAvailable } from '@/lib/stellar/freighter';
import {
  saveWalletData,
  getStoredWalletData,
  clearWalletData,
} from '@/lib/stellar/wallet-utils';

// ── context ───────────────────────────────────────────────────────────────────

const INITIAL: WalletState = {
  isConnected: false,
  publicKey: null,
  walletType: null,
  network: NetworkType.TESTNET,
  balance: null,
  isLoading: false,
  error: null,
};

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>(INITIAL);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [networkMismatch, setNetworkMismatch] = useState(false);

  useEffect(() => {
    const stored = loadWallet();
    if (!stored) return;

    setState(prev => ({ ...prev, isLoading: true }));

    (async () => {
      try {
        if (stored.walletType === WalletType.FREIGHTER) {
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
            clearWalletData();
            setState(initialState);
          }
        }
      } catch (error) {
        clearWalletData();
        setState(initialState);
      }
    };

        // Network mismatch check (best-effort)
        try {
          const details = await (freighter as any).getNetworkDetails?.();
          const freighterNetwork: string = details?.network ?? '';
          if (
            freighterNetwork &&
            freighterNetwork.toUpperCase() !== stored.network.toUpperCase()
          ) {
            setNetworkMismatch(true);
          }
        } catch { /* non-fatal */ }

        saveWallet({ walletType: stored.walletType, publicKey: address, network: stored.network });
        setState(prev => ({
          ...prev,
          isConnected: true,
          publicKey: address,
          walletType: stored.walletType,
          network: stored.network,
          isLoading: false,
          error: null,
        }));
      } catch {
        clearWallet();
        setState({ ...INITIAL });
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = useCallback(async (walletType: WalletType) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    setShowInstallPrompt(false);
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
      const next: WalletState = {
        ...state, isConnected: true, publicKey, walletType, isLoading: false, error: null,
      };

      setState(newState);

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
  }, [state]);

  const disconnect = useCallback(() => {
    clearWallet();
    setState(INITIAL);
  }, []);

  const switchNetwork = useCallback(async (network: NetworkType) => {
    if (!state.isConnected || !state.walletType) {
      setState(prev => ({ ...prev, network }));
      return;
    }
    setState(prev => ({ ...prev, isLoading: true, error: null }));
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

  const getBalance = useCallback(async () => {
    if (!state.publicKey) return;
    try {
      const { Horizon } = await import('@stellar/stellar-sdk');
      const server = new Horizon.Server(
        state.network === NetworkType.MAINNET
          ? 'https://horizon.stellar.org'
          : 'https://horizon-testnet.stellar.org',
      );
      const account = await server.loadAccount(state.publicKey);
      const xlm = account.balances.find((b: any) => b.asset_type === 'native');
      setState(prev => ({ ...prev, balance: xlm?.balance ?? '0' }));
    } catch { /* non-fatal */ }
  }, [state.publicKey, state.network]);

  const value: WalletContextType = {
    ...state,
    connect,
    disconnect,
    switchNetwork,
    getBalance,
    connectWallet: () => connect(WalletType.FREIGHTER),
    disconnectWallet: disconnect,
  };

  return (
    <WalletContext.Provider value={value}>
      {networkMismatch && (
        <div className="bg-orange-500/10 border-b border-orange-500/20 px-4 py-2 text-sm text-orange-400 flex items-center justify-between">
          <span>⚠️ Network mismatch: Freighter is not on the expected network. Please switch networks in Freighter.</span>
          <button
            onClick={() => setNetworkMismatch(false)}
            className="ml-4 text-orange-500/60 hover:text-orange-300 transition-colors"
          >
            ×
          </button>
        </div>
      )}
      {showInstallPrompt && (
        <div className="fixed top-4 right-4 z-50 max-w-sm">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 shadow-xl">
            <p className="font-semibold text-yellow-400 text-sm">Freighter not found</p>
            <p className="text-yellow-300/70 text-xs mt-1">
              Install the Freighter browser extension to connect your Stellar wallet.
            </p>
            <div className="flex items-center gap-3 mt-3">
              <a
                href="https://freighter.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-yellow-400 underline hover:text-yellow-300 transition-colors"
              >
                Install Freighter
              </a>
              <button
                onClick={() => setShowInstallPrompt(false)}
                className="text-xs text-yellow-500/60 hover:text-yellow-300 ml-auto transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextType {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
