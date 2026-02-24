'use client';

import React, { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { NetworkType } from '@/types/wallet';

export const NetworkSwitcher: React.FC = () => {
  const { network, switchNetwork, isLoading, isConnected } = useWallet();
  const [error, setError] = useState<string | null>(null);

  const handleNetworkSwitch = async (newNetwork: NetworkType) => {
    if (newNetwork === network) return;

    setError(null);
    try {
      await switchNetwork(newNetwork);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to switch network';
      setError(message);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => handleNetworkSwitch(NetworkType.TESTNET)}
          disabled={isLoading}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            network === NetworkType.TESTNET
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Testnet
        </button>
        <button
          onClick={() => handleNetworkSwitch(NetworkType.MAINNET)}
          disabled={isLoading}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            network === NetworkType.MAINNET
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Mainnet
        </button>
      </div>

      {error && (
        <div className="absolute top-full mt-2 right-0 w-64 bg-red-50 border border-red-200 rounded-lg p-3 shadow-lg z-50">
          <div className="flex justify-between items-start">
            <p className="text-xs text-red-600">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 ml-2"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {isConnected && network === NetworkType.MAINNET && (
        <div className="absolute top-full mt-2 right-0 w-64 bg-yellow-50 border border-yellow-200 rounded-lg p-3 shadow-lg">
          <p className="text-xs text-yellow-800">
            ⚠️ You are on Mainnet. Real funds will be used.
          </p>
        </div>
      )}
    </div>
  );
};
