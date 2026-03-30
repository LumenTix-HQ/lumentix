'use client';

import { useStellarWallet } from '@/hooks/useStellarWallet';

export function WalletConnect() {
  const { isConnected, publicKey, balance, isLoading, error, connectWallet, disconnectWallet, getBalance } = useStellarWallet();

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        <span className="text-sm text-gray-600">Connecting...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col space-y-2">
        <button
          onClick={connectWallet}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Connect Wallet
        </button>
        <span className="text-sm text-red-600">{error}</span>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <button
        onClick={connectWallet}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Connect Freighter Wallet
      </button>
    );
  }

  return (
    <div className="flex flex-col space-y-3">
      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-green-800">Connected</p>
            <p className="text-xs text-green-600 font-mono truncate max-w-[200px]">
              {publicKey}
            </p>
          </div>
          <button
            onClick={disconnectWallet}
            className="text-xs text-red-600 hover:text-red-800 transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>
      
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Balance</p>
            <p className="text-lg font-bold text-gray-900">
              {balance ? `${parseFloat(balance).toFixed(7)} XLM` : 'Loading...'}
            </p>
          </div>
          <button
            onClick={getBalance}
            className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
