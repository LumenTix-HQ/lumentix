'use client';

import { useWallet } from '@/contexts/WalletContext';

interface InsufficientFundsWarningProps {
  balance: number;
  requiredAmount: number;
  shortfall: number;
}

export function InsufficientFundsWarning({ balance, requiredAmount, shortfall }: InsufficientFundsWarningProps) {
  const { publicKey } = useWallet();
  const isTestnet = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'testnet';

  return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <svg className="w-5 h-5 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div className="space-y-1">
          <p className="text-red-400 font-semibold text-sm">Insufficient XLM Balance</p>
          <p className="text-red-300/80 text-xs">
            You need <strong>{shortfall.toFixed(2)} more XLM</strong> to complete this transaction.
          </p>
          <p className="text-gray-400 text-xs">
            Current balance: {balance.toFixed(2)} XLM | Required: {requiredAmount.toFixed(2)} XLM
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <a
          href="https://laboratory.stellar.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-blue-400 hover:underline text-center"
        >
          Fund via Stellar Laboratory →
        </a>
        {isTestnet && publicKey && (
          <a
            href={`https://friendbot.stellar.org/?addr=${publicKey}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-green-400 hover:underline text-center"
          >
            Get Testnet XLM from Friendbot →
          </a>
        )}
      </div>
    </div>
  );
}
