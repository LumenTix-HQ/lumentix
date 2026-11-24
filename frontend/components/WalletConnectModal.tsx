'use client';

import React, { useState, useCallback } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { WalletType, NetworkType } from '@/types/wallet';

interface WalletConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  network?: NetworkType;
}

/**
 * WalletConnect QR / URI Modal
 *
 * Shows a pairing URI that users can scan with their WalletConnect-compatible
 * mobile or hardware wallet. Once the wallet scans the URI the session is
 * approved and the Stellar public key is captured into WalletContext.
 */
export function WalletConnectModal({ isOpen, onClose, network }: WalletConnectModalProps) {
  const wallet = useWallet();
  const [uri, setUri] = useState<string | null>(null);
  const [approval, setApproval] = useState<(() => Promise<any>) | null>(null);
  const [step, setStep] = useState<'idle' | 'pairing' | 'approving' | 'connected' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleInitiate = useCallback(async () => {
    setStep('pairing');
    setErrorMsg(null);
    try {
      if (!wallet.initiate_wallet_connect) {
        throw new Error('WalletConnect not available');
      }
      const proposal = await wallet.initiate_wallet_connect(network);
      setUri(proposal.uri);
      setApproval(() => proposal.approval);
    } catch (err) {
      setStep('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to initiate WalletConnect');
    }
  }, [wallet, network]);

  const handleApprove = useCallback(async () => {
    if (!approval) return;
    setStep('approving');
    setErrorMsg(null);
    try {
      if (!wallet.approve_wallet_session) {
        throw new Error('WalletConnect approval not available');
      }
      await wallet.approve_wallet_session(approval);
      setStep('connected');
      setTimeout(onClose, 1500);
    } catch (err) {
      setStep('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to approve session');
    }
  }, [approval, wallet, onClose]);

  const handleCopyUri = useCallback(async () => {
    if (!uri) return;
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* non-fatal */ }
  }, [uri]);

  const handleClose = useCallback(() => {
    setUri(null);
    setApproval(null);
    setStep('idle');
    setErrorMsg(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <span className="text-2xl">🔗</span>
          <h2 className="text-lg font-bold text-white">WalletConnect</h2>
        </div>

        {/* Step: Idle — start pairing */}
        {step === 'idle' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Connect your hardware wallet or mobile wallet via the WalletConnect protocol.
              Supports any Stellar-compatible WalletConnect wallet.
            </p>
            <button
              onClick={handleInitiate}
              className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
            >
              Initiate Connection
            </button>
          </div>
        )}

        {/* Step: Pairing — show URI */}
        {step === 'pairing' && uri && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Scan this pairing URI with your WalletConnect-compatible wallet,
              or copy it and paste in your wallet&apos;s WalletConnect entry.
            </p>
            <div className="rounded-lg bg-gray-800 p-3 break-all text-xs text-gray-300 font-mono max-h-24 overflow-y-auto">
              {uri}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopyUri}
                className="flex-1 rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-600 transition-colors"
              >
                {copied ? '✓ Copied' : 'Copy URI'}
              </button>
              <button
                onClick={handleApprove}
                className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 transition-colors"
              >
                Approve Session
              </button>
            </div>
          </div>
        )}

        {/* Step: Pairing — loading */}
        {step === 'pairing' && !uri && (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span className="ml-3 text-sm text-gray-400">Generating pairing URI…</span>
          </div>
        )}

        {/* Step: Approving */}
        {step === 'approving' && (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
            <p className="text-sm text-gray-400">Waiting for wallet approval…</p>
          </div>
        )}

        {/* Step: Connected */}
        {step === 'connected' && (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <span className="text-4xl">✅</span>
            <p className="text-sm font-semibold text-green-400">Wallet connected successfully!</p>
            {wallet.publicKey && (
              <p className="text-xs text-gray-500 font-mono truncate max-w-[300px]">
                {wallet.publicKey}
              </p>
            )}
          </div>
        )}

        {/* Step: Error */}
        {step === 'error' && (
          <div className="space-y-4">
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4">
              <p className="text-sm text-red-400">{errorMsg ?? 'An unknown error occurred.'}</p>
            </div>
            <button
              onClick={() => setStep('idle')}
              className="w-full rounded-xl bg-gray-700 px-5 py-3 text-sm font-medium text-gray-200 hover:bg-gray-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default WalletConnectModal;
