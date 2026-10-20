'use client';

import { useState, useCallback } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { SponsorTier } from '@/components/SponsorTierCard';
import { signTransaction } from '@stellar/freighter-api';
import { NetworkType } from '@/types/wallet';
import { apiClient } from '@/lib/api-client';

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
        // Initiate sponsorship and get XDR to sign, through the shared
        // api client so transient failures get the same retry/backoff and
        // auth handling as the rest of the app.
        const { xdr, contributionId } = await apiClient.initiateSponsorship(eventId, {
          tierId: tier.id,
          amount,
          displayName: displayName || undefined,
          logoUrl: logoUrl || undefined,
          sponsorPublicKey: publicKey,
        });

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
        const confirmed = await apiClient.confirmSponsorship(contributionId, signedXdr);
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
