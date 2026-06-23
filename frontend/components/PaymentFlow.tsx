'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import usePaymentStatus from '@/hooks/usePaymentStatus';
import { useWalletBalance } from '@/hooks/useWalletBalance';

interface PaymentFlowProps {
  eventId: string;
  ticketPrice: number;
  currency: string;
}

type FlowState = 'idle' | 'connecting' | 'initiating' | 'polling' | 'confirmed' | 'failed';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export default function PaymentFlow({ eventId, ticketPrice, currency }: PaymentFlowProps) {
  const wallet = useWallet();
  const isConnected = wallet.state?.isConnected ?? wallet.isConnected;
  const connectWallet = wallet.state ? wallet.connectWallet : (wallet as any).connect;
  const { balance, hasInsufficientFunds, shortfall: getShortfall, refreshBalance } = useWalletBalance();

  const [flowState, setFlowState] = useState<FlowState>('idle');
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { status: paymentStatus } = usePaymentStatus(paymentId);

  const insufficientFunds = ticketPrice > 0 && hasInsufficientFunds(ticketPrice);
  const shortfall = getShortfall(ticketPrice);

  if (paymentStatus === 'CONFIRMED') {
    return (
      <div className="space-y-3">
        <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-3 rounded-xl text-center font-medium">
          ✓ Payment confirmed!
        </div>
        <a
          href={`/my-tickets?paymentId=${paymentId}`}
          className="block w-full bg-green-600 text-white text-center py-3 rounded-xl font-semibold hover:bg-green-500 transition-colors"
        >
          Download Ticket
        </a>
      </div>
    );
  }

  if (paymentStatus === 'FAILED' || flowState === 'failed') {
    return (
      <div className="space-y-3">
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-sm">
          {error || 'Payment failed. Please try again.'}
        </div>
        <button
          onClick={() => { setFlowState('idle'); setError(null); setPaymentId(null); }}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-500 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (flowState === 'polling') {
    return (
      <div className="text-center space-y-2 py-2">
        <div className="animate-spin mx-auto h-7 w-7 border-[3px] border-blue-500 border-t-transparent rounded-full" />
        <p className="text-sm text-gray-400">Confirming payment on Stellar…</p>
      </div>
    );
  }

  // Refresh balance after successful payment
  useEffect(() => {
    if (paymentStatus === 'CONFIRMED') {
      refreshBalance();
    }
  }, [paymentStatus, refreshBalance]);

  const handleRegister = async () => {
    setError(null);

    if (!isConnected) {
      setFlowState('connecting');
      try {
        await connectWallet?.();
      } catch {
        setError('Failed to connect wallet');
        setFlowState('idle');
        return;
      }
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (!token) {
      setError('Please log in to register for this event');
      setFlowState('idle');
      return;
    }

    setFlowState('initiating');
    try {
      const res = await fetch(`${API_BASE}/payments/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ eventId, currency }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Failed to initiate payment');
      }
      const data = await res.json();
      setPaymentId(data.id);
      setFlowState('polling');
    } catch (e: any) {
      setError(e.message);
      setFlowState('failed');
    }
  };

  return (
    <div className="space-y-3">
      {error && <p className="text-red-400 text-sm">{error}</p>}
      
      {/* Insufficient funds warning */}
      {insufficientFunds && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-red-400 mt-0.5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="space-y-1">
              <p className="text-red-400 font-semibold text-sm">Insufficient XLM Balance</p>
              <p className="text-red-300/80 text-xs">
                You need {shortfall.toFixed(2)} more XLM to complete this transaction.
              </p>
              <p className="text-gray-400 text-xs">
                Current balance: {balance.toFixed(2)} XLM | Required: {(ticketPrice + 0.50001).toFixed(2)} XLM
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
            {process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'testnet' && wallet.publicKey && (
              <a
                href={`https://friendbot.stellar.org/?addr=${wallet.publicKey}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-green-400 hover:underline text-center"
              >
                Get Testnet XLM →
              </a>
            )}
          </div>
        </div>
      )}

      <button
        onClick={handleRegister}
        disabled={flowState !== 'idle' || insufficientFunds}
        className={`w-full py-3 rounded-xl font-semibold transition-colors ${
          insufficientFunds
            ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed'
        }`}
      >
        {flowState === 'connecting'
          ? 'Connecting wallet…'
          : flowState === 'initiating'
          ? 'Initiating payment…'
          : !isConnected
          ? 'Connect Wallet & Register'
          : ticketPrice === 0
          ? 'Register (Free)'
          : `Register — ${ticketPrice} ${currency}`}
      </button>
      
      {!isConnected && (
        <p className="text-xs text-gray-500 text-center">Requires Freighter wallet</p>
      )}
    </div>
  );
}
