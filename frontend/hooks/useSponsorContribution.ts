'use client';

import { useState, useCallback } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { SponsorTier } from '@/components/SponsorTierCard';
import { signTransaction } from '@stellar/freighter-api';
import { NetworkType } from '@/types/wallet';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export type ContributionStatus = 'idle' | 'initiating' | 'signing' | 'confirming' | 'confirmed' | 'failed';

export interface ContributionResult {
  rank?: number;
  transactionHash?: string;
  contributionId?: string;
}

export function useSponsorContribution(eventId: string) {
  const { publicKey, network } = useWallet();
  const [status, setStatus] = useState<ContributionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ContributionResult | null>(null);

  const contribute = useCallback(
    async (tier: SponsorTier, amount: number, displayName?: string, logoUrl?: string) => {
      if (!publicKey) {
        setError('Wallet not connected');
        return;
      }

      if (amount < tier.minAmount) {
        setError(`Minimum contribution is ${tier.minAmount} ${tier.currency ?? 'XLM'}`);
        return;
      }

      setStatus('initiating');
      setError(null);
      setResult(null);

      try {
        const token = typeof window !== 'undefined'
          ? localStorage.getItem('lumentix_access_token')
          : null;

        // Initiate sponsorship and get XDR to sign
        const initRes = await fetch(`${API_BASE}/events/${eventId}/sponsors`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            tierId: tier.id,
            amount,
            displayName: displayName || undefined,
            logoUrl: logoUrl || undefined,
            sponsorPublicKey: publicKey,
          }),
        });

        if (!initRes.ok) {
          const body = await initRes.json().catch(() => ({}));
          throw new Error(body.message ?? `Failed to initiate sponsorship (${initRes.status})`);
        }

        const { xdr, contributionId } = await initRes.json();

        setStatus('signing');

        // Sign with Freighter
        const networkPassphrase =
          network === NetworkType.MAINNET
            ? 'Public Global Stellar Network ; September 2015'
            : 'Test SDF Network ; September 2015';

        const signedXdr = await signTransaction(xdr, {
          networkPassphrase,
          accountToSign: publicKey,
        });

        setStatus('confirming');

        // Submit signed transaction
        const submitRes = await fetch(`${API_BASE}/sponsors/contributions/${contributionId}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ signedXdr }),
        });

        if (!submitRes.ok) {
          const body = await submitRes.json().catch(() => ({}));
          throw new Error(body.message ?? 'Failed to confirm contribution');
        }

        const confirmed = await submitRes.json();
        setResult({ rank: confirmed.rank, transactionHash: confirmed.transactionHash, contributionId });
        setStatus('confirmed');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Contribution failed';
        // User-cancelled Freighter signing is not an error
        if (msg.toLowerCase().includes('user declined') || msg.toLowerCase().includes('cancelled')) {
          setStatus('idle');
        } else {
          setError(msg);
          setStatus('failed');
        }
      }
    },
    [eventId, publicKey, network],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setResult(null);
  }, []);

  return { status, error, result, contribute, reset };
}
