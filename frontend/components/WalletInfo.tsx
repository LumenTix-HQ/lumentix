'use client';

import React from 'react';
import { useWallet } from '@/contexts/WalletContext';

export const WalletInfo: React.FC = () => {
  const { isConnected, publicKey, walletType, network } = useWallet();

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
          <p className="text-sm text-gray-600 mb-1">Public Key</p>
          <p className="font-mono text-xs break-all bg-gray-50 p-2 rounded">
            {publicKey}
          </p>
        </div>
      </div>
    </div>
  );
};
