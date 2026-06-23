'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { NetworkType } from '@/types/wallet';
import { getNetwork } from '@stellar/freighter-api';

const EXPECTED: NetworkType =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK as NetworkType) ?? NetworkType.TESTNET;

export function NetworkMismatchBanner() {
  const { isConnected, network, switchNetwork, isLoading } = useWallet();
  const [freighterNetwork, setFreighterNetwork] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) {
      setFreighterNetwork(null);
      return;
    }
    let cancelled = false;
    getNetwork()
      .then((result) => {
        if (cancelled) return;
        // freighter-api v6 returns { network, networkPassphrase } | { error }
        const net = typeof result === 'string' ? result : (result as { network?: string }).network ?? null;
        setFreighterNetwork(net);
      })
      .catch(() => { if (!cancelled) setFreighterNetwork(null); });
    return () => { cancelled = true; };
  }, [isConnected, network]);

  const appNetwork = EXPECTED === NetworkType.MAINNET ? 'PUBLIC' : 'TESTNET';
  const mismatch = isConnected && freighterNetwork !== null && freighterNetwork !== appNetwork;

  if (!mismatch) return null;

  const target = EXPECTED === NetworkType.MAINNET ? 'Mainnet' : 'Testnet';

  const handleSwitch = async () => {
    setSwitching(true);
    setError(null);
    try {
      await switchNetwork(EXPECTED);
      setFreighterNetwork(appNetwork);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch network');
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-black px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2"
    >
      <span className="text-sm font-medium text-center sm:text-left">
        ⚠️ Network mismatch — Freighter is on{' '}
        <strong>{freighterNetwork}</strong> but this app expects{' '}
        <strong>{appNetwork}</strong>. Transactions will fail.
      </span>

      <div className="flex items-center gap-3 shrink-0">
        {error && <span className="text-xs text-red-800">{error}</span>}
        <button
          onClick={handleSwitch}
          disabled={switching || isLoading}
          className="bg-black text-white text-sm font-semibold px-4 py-1.5 rounded-full hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label={`Switch Freighter to ${target}`}
        >
          {switching ? 'Switching…' : `Switch to ${target}`}
        </button>
      </div>
    </div>
  );
}
