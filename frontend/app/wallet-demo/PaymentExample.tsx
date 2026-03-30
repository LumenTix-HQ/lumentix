'use client';

import React, { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { TransactionHelper } from '@/lib/stellar/transaction-helper';

export const PaymentExample: React.FC = () => {
  const { isConnected, publicKey, network } = useWallet();
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const helper = new TransactionHelper(network);
      
      // Build transaction
      const transaction = await helper.buildPaymentTransaction(
        publicKey,
        destination,
        amount
      );

      // Sign and submit
      const response = await helper.signAndSubmitWithFreighter(transaction);
      
      setResult(`Transaction successful! Hash: ${response.hash}`);
      setDestination('');
      setAmount('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transaction failed';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
        <p className="text-gray-600">Connect your wallet to send payments</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4">Send Payment</h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Destination Address
          </label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Amount (XLM)
          </label>
          <input
            type="number"
            step="0.0000001"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10.00"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Processing...' : 'Send Payment'}
        </button>
      </form>

      {result && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">{result}</p>
        </div>
      )}

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-xs text-yellow-800">
          ⚠️ This is a demo. Make sure you're on {network} and have sufficient balance.
        </p>
      </div>
    </div>
  );
};
