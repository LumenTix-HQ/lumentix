'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { WalletContextType, WalletState, WalletType, NetworkType } from '@/types/wallet';

// ── helpers ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'lumentix_wallet';

function saveWallet(data: { walletType: WalletType; publicKey: string; network: NetworkType }) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

function loadWallet(): { walletType: WalletType; publicKey: string; network: NetworkType } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearWallet() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

async function connectFreighter(network: NetworkType): Promise<string> {
  const freighter = await import('@stellar/freighter-api');
  const { isConnected, error: connErr } = await freighter.isConnected();
  if (connErr || !isConnected) throw new Error('Freighter is not installed or not connected.');
  const { address, error: addrErr } = await freighter.requestAccess();
  if (addrErr || !address) throw new Error(addrErr?.message ?? 'Could not get address from Freighter.');
  return address;
}

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

  // Restore on mount
  useEffect(() => {
    const stored = loadWallet();
    if (!stored) return;
    setState(prev => ({
      ...prev,
      isConnected: true,
      publicKey: stored.publicKey,
      walletType: stored.walletType,
      network: stored.network,
    }));
  }, []);

  const connect = useCallback(async (walletType: WalletType) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      let publicKey: string;
      if (walletType === WalletType.FREIGHTER) {
        publicKey = await connectFreighter(state.network);
      } else {
        throw new Error(`${walletType} integration coming soon.`);
      }
      const next: WalletState = {
        ...state, isConnected: true, publicKey, walletType, isLoading: false, error: null,
      };
      setState(next);
      saveWallet({ walletType, publicKey, network: state.network });
    } catch (err) {
      setState(prev => ({
        ...prev, isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to connect wallet.',
      }));
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
      const publicKey = await connectFreighter(network);
      const next: WalletState = { ...state, publicKey, network, isLoading: false, error: null };
      setState(next);
      saveWallet({ walletType: state.walletType!, publicKey, network });
    } catch (err) {
      setState(prev => ({
        ...prev, isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to switch network.',
      }));
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

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextType {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
