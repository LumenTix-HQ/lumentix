'use client';

import React from 'react';
import { WalletProvider } from '@/contexts/WalletContext';
import { WalletButton } from '@/components/WalletButton';
import { NetworkSwitcher } from '@/components/NetworkSwitcher';
import { WalletInfo } from '@/components/WalletInfo';
import { PaymentExample } from './PaymentExample';

export default function WalletDemoPage() {
  return (
    <WalletProvider>
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h1 className="text-3xl font-bold mb-2">Wallet Connection Demo</h1>
            <p className="text-gray-600 mb-8">
              Connect your Stellar wallet to interact with LumenTix
            </p>

            <div className="flex items-center justify-between mb-8 pb-8 border-b border-gray-200">
              <div className="flex items-center gap-4">
                <NetworkSwitcher />
              </div>
              <WalletButton />
            </div>

            <WalletInfo />

            <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="font-semibold text-blue-900 mb-2">Getting Started</h3>
              <ul className="text-sm text-blue-800 space-y-2">
                <li>• Install Freighter wallet extension from freighter.app</li>
                <li>• Create or import a Stellar account</li>
                <li>• Select your preferred network (Testnet or Mainnet)</li>
                <li>• Click "Connect Wallet" and approve the connection</li>
              </ul>
            </div>
          </div>

          <PaymentExample />
        </div>
      </div>
    </WalletProvider>
  );
}
