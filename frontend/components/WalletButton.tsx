'use client';

import React, { useState } from 'react';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { WalletType } from '@/types/wallet';

export const WalletButton: React.FC = () => {
  const {
    isConnected,
    publicKey,
    isConnecting,
    connectionError,
    connectWallet,
    disconnectWallet,
    clearError,
  } = useWalletConnection();

  const [showMenu, setShowMenu] = useState(false);

  const handleConnect = async (walletType: WalletType) => {
    try {
      await connectWallet(walletType);
      setShowMenu(false);
    } catch (error) {
      // Error is handled by the hook
    }
  };

  const handleDisconnect = () => {
    disconnectWallet();
    setShowMenu(false);
  };

  const formatPublicKey = (key: string) => {
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  };

  if (isConnected && publicKey) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          {formatPublicKey(publicKey)}
        </button>
        
        {showMenu && (
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
            <div className="p-4 border-b border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Connected Wallet</p>
              <p className="text-xs font-mono break-all">{publicKey}</p>
            </div>
            <button
              onClick={handleDisconnect}
              className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={isConnecting}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
      >
        {isConnecting ? 'Connecting...' : 'Connect Wallet'}
      </button>

      {showMenu && !isConnecting && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="p-2">
            <button
              onClick={() => handleConnect(WalletType.FREIGHTER)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-3"
            >
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                <span className="text-purple-600 font-bold">F</span>
              </div>
              <div>
                <p className="font-medium">Freighter</p>
                <p className="text-xs text-gray-500">Browser extension</p>
              </div>
            </button>

            <button
              disabled
              className="w-full px-4 py-3 text-left hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-3 opacity-50 cursor-not-allowed"
            >
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-bold">L</span>
              </div>
              <div>
                <p className="font-medium">LOBSTR</p>
                <p className="text-xs text-gray-500">Coming soon</p>
              </div>
            </button>

            <button
              disabled
              className="w-full px-4 py-3 text-left hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-3 opacity-50 cursor-not-allowed"
            >
              <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                <span className="text-indigo-600 font-bold">W</span>
              </div>
              <div>
                <p className="font-medium">WalletConnect</p>
                <p className="text-xs text-gray-500">Coming soon</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {connectionError && (
        <div className="absolute right-0 mt-2 w-80 bg-red-50 border border-red-200 rounded-lg p-4 shadow-lg z-50">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-red-800 mb-1">Connection Error</p>
              <p className="text-xs text-red-600">{connectionError}</p>
            </div>
            <button
              onClick={clearError}
              className="text-red-400 hover:text-red-600"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
