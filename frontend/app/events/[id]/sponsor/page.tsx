'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SponsorTierCard, SponsorTier } from '@/components/SponsorTierCard';
import { useSponsorContribution } from '@/hooks/useSponsorContribution';
import { useWallet } from '@/contexts/WalletContext';
import { WalletType } from '@/types/wallet';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

interface EventSummary {
  id: string;
  title: string;
  sponsorTiers?: SponsorTier[];
}

export default function SponsorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const eventId = params.id;

  const { isConnected, connect } = useWallet();
  const { status, error, result, contribute, reset } = useSponsorContribution(eventId);

  const [event, setEvent] = useState<EventSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<SponsorTier | null>(null);
  const [amount, setAmount] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/events/${eventId}`)
      .then((r) => r.json())
      .then((data) => {
        // Sort tiers by minAmount ascending
        const tiers: SponsorTier[] = (data.sponsorTiers ?? []).sort(
          (a: SponsorTier, b: SponsorTier) => a.minAmount - b.minAmount,
        );
        setEvent({ ...data, sponsorTiers: tiers });
        setLoading(false);
      })
      .catch(() => {
        setFetchError('Failed to load event details');
        setLoading(false);
      });
  }, [eventId]);

  const handleTierSelect = (tier: SponsorTier) => {
    setSelectedTier(tier);
    setAmount(String(tier.minAmount));
    setAmountError(null);
    reset();
  };

  const validateAmount = (): boolean => {
    const n = parseFloat(amount);
    if (isNaN(n) || n <= 0) {
      setAmountError('Please enter a valid amount');
      return false;
    }
    if (selectedTier && n < selectedTier.minAmount) {
      setAmountError(`Minimum for this tier is ${selectedTier.minAmount} ${selectedTier.currency ?? 'XLM'}`);
      return false;
    }
    setAmountError(null);
    return true;
  };

  const handleContribute = async () => {
    if (!selectedTier) return;
    if (!validateAmount()) return;
    if (!isConnected) {
      await connect(WalletType.FREIGHTER);
      return;
    }
    await contribute(selectedTier, parseFloat(amount), displayName || undefined, logoUrl || undefined);
  };

  // ── Thank-you screen ───────────────────────────────────────────────────────
  if (status === 'confirmed' && result) {
    return (
      <main className="min-h-screen bg-[#060609] text-white flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="text-6xl mb-6">🏆</div>
          <h1 className="text-3xl font-extrabold mb-3 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
            Thank you for sponsoring!
          </h1>
          <p className="text-gray-400 mb-4">
            Your contribution to <strong className="text-white">{event?.title}</strong> has been confirmed.
          </p>
          {result.rank && (
            <p className="text-lg font-semibold text-blue-400 mb-6">
              You are sponsor #{result.rank} on the leaderboard
            </p>
          )}
          {result.transactionHash && (
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${result.transactionHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 underline hover:text-gray-300 block mb-8"
            >
              View transaction on Stellar Expert
            </a>
          )}
          <button
            onClick={() => router.push(`/events/${eventId}`)}
            className="px-6 py-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
          >
            Back to Event
          </button>
        </div>
      </main>
    );
  }

  // ── Main page ──────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#060609] text-white px-4 pb-20 pt-28">
      <div className="max-w-4xl mx-auto">
        {loading && (
          <p className="text-gray-400 text-center animate-pulse">Loading event…</p>
        )}

        {fetchError && (
          <p role="alert" className="text-red-400 text-center">{fetchError}</p>
        )}

        {event && !loading && (
          <>
            <header className="mb-10">
              <p className="text-blue-400 text-sm font-semibold uppercase tracking-wider mb-2">Become a Sponsor</p>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white">{event.title}</h1>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Tier selection */}
              <section aria-labelledby="tiers-heading">
                <h2 id="tiers-heading" className="text-lg font-bold text-white mb-4">Select a Tier</h2>
                {!event.sponsorTiers?.length ? (
                  <p className="text-gray-500">No sponsor tiers available for this event.</p>
                ) : (
                  <div className="space-y-3" role="radiogroup" aria-label="Sponsor tiers">
                    {event.sponsorTiers.map((tier) => (
                      <SponsorTierCard
                        key={tier.id}
                        tier={tier}
                        selected={selectedTier?.id === tier.id}
                        onSelect={handleTierSelect}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* Contribution form */}
              <section aria-labelledby="form-heading">
                <h2 id="form-heading" className="text-lg font-bold text-white mb-4">Contribution Details</h2>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
                  {/* Amount */}
                  <div>
                    <label htmlFor="amount" className="block text-sm font-medium text-gray-300 mb-1.5">
                      Amount ({selectedTier?.currency ?? 'XLM'})
                    </label>
                    <input
                      id="amount"
                      type="number"
                      min={selectedTier?.minAmount ?? 1}
                      step="any"
                      value={amount}
                      onChange={(e) => { setAmount(e.target.value); setAmountError(null); }}
                      aria-describedby={amountError ? 'amount-error' : undefined}
                      aria-invalid={!!amountError}
                      placeholder={selectedTier ? `Min ${selectedTier.minAmount}` : 'Select a tier first'}
                      disabled={!selectedTier}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
                    />
                    {amountError && (
                      <p id="amount-error" role="alert" className="mt-1 text-xs text-red-400">{amountError}</p>
                    )}
                  </div>

                  {/* Display name */}
                  <div>
                    <label htmlFor="displayName" className="block text-sm font-medium text-gray-300 mb-1.5">
                      Display Name <span className="text-gray-500">(optional)</span>
                    </label>
                    <input
                      id="displayName"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name or company"
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Logo URL */}
                  <div>
                    <label htmlFor="logoUrl" className="block text-sm font-medium text-gray-300 mb-1.5">
                      Logo URL <span className="text-gray-500">(optional)</span>
                    </label>
                    <input
                      id="logoUrl"
                      type="url"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder="https://example.com/logo.png"
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Error */}
                  {error && (
                    <p role="alert" className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">
                      {error}
                    </p>
                  )}

                  {/* Submit */}
                  <button
                    type="button"
                    onClick={handleContribute}
                    disabled={!selectedTier || ['initiating', 'signing', 'confirming'].includes(status)}
                    aria-busy={['initiating', 'signing', 'confirming'].includes(status)}
                    className="w-full py-3 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
                  >
                    {!isConnected
                      ? 'Connect Wallet to Contribute'
                      : status === 'initiating'
                      ? 'Initiating…'
                      : status === 'signing'
                      ? 'Waiting for signature…'
                      : status === 'confirming'
                      ? 'Confirming on-chain…'
                      : 'Contribute'}
                  </button>
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
