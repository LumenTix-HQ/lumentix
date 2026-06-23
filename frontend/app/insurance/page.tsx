'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import {
  InsurancePolicy,
  InsurancePolicyStatus,
  InsurancePool,
  CancellationReason,
  CANCELLATION_REASON_LABELS,
} from '@/types/insurance';

// ── helpers ───────────────────────────────────────────────────────────────────

function getToken(): string {
  return typeof window !== 'undefined'
    ? localStorage.getItem('lumentix_access_token') ?? ''
    : '';
}

const STATUS_STYLES: Record<InsurancePolicyStatus, string> = {
  [InsurancePolicyStatus.ACTIVE]:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  [InsurancePolicyStatus.CLAIMED]:   'bg-blue-500/15 text-blue-400 border-blue-500/30',
  [InsurancePolicyStatus.EXPIRED]:   'bg-gray-500/15 text-gray-400 border-gray-500/30',
  [InsurancePolicyStatus.CANCELLED]: 'bg-red-500/15 text-red-400 border-red-500/30',
};

// ── sub-components ────────────────────────────────────────────────────────────

function PoolStats({ pool }: { pool: InsurancePool }) {
  const stats = [
    { label: 'Total Policies', value: pool.totalPolicies.toLocaleString() },
    { label: 'Claims Processed', value: pool.totalClaimsProcessed.toLocaleString() },
    { label: 'Premiums Collected', value: `${Number(pool.totalPremiumCollected).toFixed(4)} XLM` },
    { label: 'Claims Paid Out', value: `${Number(pool.totalClaimsPaid).toFixed(4)} XLM` },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
      {stats.map(s => (
        <div key={s.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <div className="text-xl font-bold text-white">{s.value}</div>
          <div className="text-xs text-gray-500 mt-1">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function PolicyCard({
  policy,
  onClaim,
}: {
  policy: InsurancePolicy;
  onClaim: (policy: InsurancePolicy) => void;
}) {
  const badge = STATUS_STYLES[policy.status];
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 font-mono">
          Ticket: {policy.ticketId.slice(0, 8)}…
        </span>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${badge}`}>
          {policy.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-gray-500 text-xs mb-0.5">Premium Paid</div>
          <div className="text-white font-semibold">
            {Number(policy.premiumPaid).toFixed(4)} {policy.currency}
          </div>
        </div>
        <div>
          <div className="text-gray-500 text-xs mb-0.5">Coverage</div>
          <div className="text-white font-semibold">
            {Number(policy.coverageAmount).toFixed(4)} {policy.currency}
          </div>
        </div>
      </div>

      {policy.claimReason && (
        <div className="text-xs text-gray-400 bg-white/[0.03] rounded-lg px-3 py-2">
          Claim reason: {policy.claimReason.replace(/_/g, ' ').toLowerCase()}
        </div>
      )}

      <div className="text-[11px] text-gray-600">
        Purchased {new Date(policy.createdAt).toLocaleDateString()}
      </div>

      {policy.status === InsurancePolicyStatus.ACTIVE && (
        <button
          onClick={() => onClaim(policy)}
          className="mt-1 w-full py-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 text-sm font-medium hover:bg-blue-600/30 transition-colors"
        >
          File Claim
        </button>
      )}
    </div>
  );
}

// ── claim modal ───────────────────────────────────────────────────────────────

function ClaimModal({
  policy,
  onClose,
  onSuccess,
}: {
  policy: InsurancePolicy;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState<CancellationReason>(CancellationReason.EVENT_CANCELLED_BY_ORGANIZER);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.fileInsuranceClaim(
        { ticketId: policy.ticketId, cancellationReason: reason },
        getToken(),
      );
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to file claim.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0e0e14] border border-white/[0.1] rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-white mb-1">File Insurance Claim</h3>
        <p className="text-sm text-gray-500 mb-5">
          Coverage: <span className="text-white font-semibold">
            {Number(policy.coverageAmount).toFixed(4)} {policy.currency}
          </span>
        </p>

        <label className="block text-sm text-gray-400 mb-2">Cancellation Reason</label>
        <select
          value={reason}
          onChange={e => setReason(e.target.value as CancellationReason)}
          className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-sm text-white mb-4 outline-none focus:border-blue-500/50"
        >
          {Object.values(CancellationReason).map(r => (
            <option key={r} value={r}>{CANCELLATION_REASON_LABELS[r]}</option>
          ))}
        </select>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/[0.1] text-gray-400 text-sm hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-60 transition-colors"
          >
            {loading ? 'Processing…' : 'Submit Claim'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── purchase form ─────────────────────────────────────────────────────────────

function PurchaseForm({ onSuccess }: { onSuccess: () => void }) {
  const [ticketId, setTicketId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketId.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const policy = await apiClient.purchaseInsurance({ ticketId: ticketId.trim() }, getToken()) as InsurancePolicy;
      setSuccess(`Policy created! Premium: ${Number(policy.premiumPaid).toFixed(4)} ${policy.currency}`);
      setTicketId('');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to purchase insurance.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 mb-8">
      <h3 className="text-base font-semibold text-white mb-4">Purchase Ticket Insurance</h3>
      <p className="text-sm text-gray-500 mb-4">
        Pay 10% of your ticket price as a premium. Get a full refund if the event is cancelled.
      </p>

      <div className="flex gap-3">
        <input
          type="text"
          value={ticketId}
          onChange={e => setTicketId(e.target.value)}
          placeholder="Ticket UUID"
          className="flex-1 bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
        />
        <button
          type="submit"
          disabled={loading || !ticketId.trim()}
          className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-60 transition-colors"
        >
          {loading ? 'Purchasing…' : 'Purchase'}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {success && <p className="mt-3 text-sm text-emerald-400">{success}</p>}
    </form>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function InsurancePage() {
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [pool, setPool] = useState<InsurancePool | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimTarget, setClaimTarget] = useState<InsurancePolicy | null>(null);
  const [token, setToken] = useState('');

  useEffect(() => {
    setToken(getToken());
  }, []);

  const load = useCallback(async () => {
    const t = getToken();
    if (!t) { setLoading(false); return; }
    setLoading(true);
    try {
      const [p, pool] = await Promise.all([
        apiClient.getMyInsurancePolicies(t) as Promise<InsurancePolicy[]>,
        apiClient.getInsurancePool(t) as Promise<InsurancePool>,
      ]);
      setPolicies(p);
      setPool(pool);
    } catch { /* show empty state */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleClaimSuccess = () => {
    setClaimTarget(null);
    load();
  };

  return (
    <main className="min-h-screen bg-[#060609] text-white">
      {/* ambient */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-blue-600/[0.04] rounded-full blur-[150px]" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-indigo-600/[0.03] rounded-full blur-[130px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16">
        <div className="mb-10">
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 mb-2">
            Event Insurance
          </h1>
          <p className="text-gray-500">
            Protect your ticket purchase. Pay 10% premium for full refund coverage if an event is cancelled.
          </p>
        </div>

        {/* Pool stats */}
        {pool && <PoolStats pool={pool} />}

        {/* Auth gate */}
        {!token ? (
          <div className="text-center py-16 text-gray-500">
            <div className="text-4xl mb-4">🔒</div>
            <p>Connect your wallet and sign in to manage insurance policies.</p>
          </div>
        ) : (
          <>
            <PurchaseForm onSuccess={load} />

            <h2 className="text-lg font-semibold text-white mb-4">My Policies</h2>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-44 rounded-xl bg-white/[0.03] animate-pulse" />
                ))}
              </div>
            ) : policies.length === 0 ? (
              <div className="text-center py-12 text-gray-600">
                <div className="text-3xl mb-3">🛡️</div>
                <p>No insurance policies yet. Purchase one above to get started.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {policies.map(p => (
                  <PolicyCard key={p.id} policy={p} onClaim={setClaimTarget} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {claimTarget && (
        <ClaimModal
          policy={claimTarget}
          onClose={() => setClaimTarget(null)}
          onSuccess={handleClaimSuccess}
        />
      )}
    </main>
  );
}
