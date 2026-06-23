'use client';

import React from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useWalletBalance } from '@/hooks/useWalletBalance';

export const WalletInfo: React.FC = () => {
  const { isConnected, publicKey, walletType, network } = useWallet();
  const { balance, isLoading: balanceLoading, refreshBalance } = useWalletBalance();

  if (!isConnected || !publicKey) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
        <p className="text-gray-600">No wallet connected</p>
        <p className="text-sm text-gray-500 mt-2">
          Connect your wallet to get started
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4">Wallet Information</h3>
      
      <div className="space-y-3">
        <div>
          <p className="text-sm text-gray-600 mb-1">Wallet Type</p>
          <p className="font-mono text-sm capitalize">{walletType}</p>
        </div>

        <div>
          <p className="text-sm text-gray-600 mb-1">Network</p>
          <p className="font-mono text-sm capitalize">{network}</p>
        </div>

        <div>
          <p className="text-sm text-gray-600 mb-1">XLM Balance</p>
          <div className="flex items-center gap-2">
            {balanceLoading ? (
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
            ) : (
              <>
                <p className="font-mono text-lg font-semibold text-blue-600">
                  {balance.toFixed(2)} XLM
                </p>
                <button
                  onClick={refreshBalance}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                  title="Refresh balance"
                >
                  <svg
                    className="w-4 h-4 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        <div>
          <p className="text-sm text-gray-600 mb-1">Public Key</p>
          <p className="font-mono text-xs break-all bg-gray-50 p-2 rounded">
            {publicKey}
          </p>
        </div>
      </div>
    </div>
  );
};
