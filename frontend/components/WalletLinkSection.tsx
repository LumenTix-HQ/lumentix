'use client';

import React, { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { getNetworkPassphrase } from '@/lib/stellar/wallet-utils';
import { NetworkType } from '@/types/wallet';

interface WalletLinkSectionProps {
  linkedAddress: string | null;
  onLinked: (address: string) => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

type LinkStep = 'idle' | 'fetching-challenge' | 'awaiting-sign' | 'verifying' | 'done';

const NETWORK: NetworkType =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK as NetworkType) ?? NetworkType.TESTNET;

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-8)}`;
}

export default function WalletLinkSection({
  linkedAddress,
  onLinked,
  onToast,
}: WalletLinkSectionProps) {
  const { isAuthenticated } = useAuth();
  const [step, setStep] = useState<LinkStep>('idle');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleLink() {
    if (!isAuthenticated) {
      onToast('You must be signed in to link a wallet.', 'error');
      return;
    }
    setErr(null);
    setStep('fetching-challenge');
    try {
      const freighter = await import('@stellar/freighter-api');
      const { address, error: addrErr } = await freighter.requestAccess();
      if (addrErr || !address) throw new Error('Could not access Freighter wallet');

      const res = await apiClient.walletChallenge(address);
      setPublicKey(address);
      setChallenge(res.nonce);
      setStep('awaiting-sign');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to fetch challenge');
      setStep('idle');
    }
  }

  async function handleSign() {
    if (!challenge || !publicKey) return;
    setErr(null);
    setStep('verifying');
    try {
      const freighter = await import('@stellar/freighter-api');

      // Sign the challenge nonce as a plain message. The backend verifies the
      // signature over the raw nonce, so this is a message signature (not a
      // transaction) — but it is still bound to the configured network.
      const { signedMessage, signerAddress, error: signErr } = await freighter.signMessage(
        challenge,
        {
          networkPassphrase: getNetworkPassphrase(NETWORK),
          address: publicKey,
        },
      );
      if (signErr) throw new Error(signErr?.message ?? 'Freighter signing failed');

      const signature = typeof signedMessage === 'string' ? signedMessage : '';
      const result = await apiClient.walletVerify({
        nonce: challenge,
        signature,
        publicKey: signerAddress ?? publicKey,
      });
      onLinked(result.walletAddress ?? publicKey);
      onToast('Wallet linked successfully!', 'success');
      setStep('done');
      setChallenge(null);
      setPublicKey(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Signing failed';
      setErr(msg);
      onToast(msg, 'error');
      setStep('awaiting-sign');
    }
  }

  function handleCancel() {
    setChallenge(null);
    setPublicKey(null);
    setErr(null);
    setStep('idle');
  }

  function handleCopy() {
    if (!linkedAddress) return;
    navigator.clipboard.writeText(linkedAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Already linked ────────────────────────────────────────────────────────
  if (linkedAddress) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
          {/* Green dot */}
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          <span className="font-mono text-sm text-emerald-300 flex-1 truncate">
            {truncateAddress(linkedAddress)}
          </span>
          <button
            id="profile-wallet-copy-btn"
            onClick={handleCopy}
            className="text-xs text-gray-400 hover:text-white transition-colors shrink-0"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          This wallet is verified and linked to your account.
        </p>
      </div>
    );
  }

  // ── Challenge modal / signing step ────────────────────────────────────────
  if (step === 'awaiting-sign' && challenge) {
    return (
      <div className="flex flex-col gap-4">
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <p className="text-xs text-amber-400 font-semibold uppercase tracking-widest mb-2">
            Challenge Message
          </p>
          <p className="font-mono text-xs text-amber-200 break-all leading-relaxed">
            {challenge}
          </p>
          <p className="text-xs text-gray-400 mt-3">
            Freighter will ask you to sign this exact message. No XLM will be spent.
          </p>
        </div>
        {err && (
          <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
            {err}
          </p>
        )}
        <div className="flex gap-2">
          <button
            id="profile-wallet-sign-btn"
            onClick={handleSign}
            className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
          >
            Sign with Freighter
          </button>
          <button
            id="profile-wallet-cancel-btn"
            onClick={handleCancel}
            className="py-2.5 px-4 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Idle / loading ────────────────────────────────────────────────────────
  const isLoading = step === 'fetching-challenge' || step === 'verifying';
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-400">
        No wallet linked yet. Connect your Freighter wallet to enable on-chain ticket purchases.
      </p>
      {err && (
        <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{err}</p>
      )}
      <button
        id="profile-wallet-link-btn"
        onClick={handleLink}
        disabled={isLoading}
        className="inline-flex items-center gap-2 self-start py-2.5 px-5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:opacity-50 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-500/20"
      >
        {isLoading ? (
          <>
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {step === 'fetching-challenge' ? 'Fetching challenge…' : 'Verifying…'}
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Link Freighter Wallet
          </>
        )}
      </button>
    </div>
  );
}
