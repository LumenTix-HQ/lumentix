'use client';

import React from 'react';

export interface SponsorTier {
  id: string;
  name: string;
  description?: string;
  minAmount: number;
  maxContributors?: number;
  filledSlots?: number;
  benefits?: string[];
  currency?: string;
}

interface SponsorTierCardProps {
  tier: SponsorTier;
  selected?: boolean;
  onSelect?: (tier: SponsorTier) => void;
}

export function SponsorTierCard({ tier, selected, onSelect }: SponsorTierCardProps) {
  const isFull =
    tier.maxContributors !== undefined &&
    tier.filledSlots !== undefined &&
    tier.filledSlots >= tier.maxContributors;

  const remaining =
    tier.maxContributors !== undefined && tier.filledSlots !== undefined
      ? tier.maxContributors - tier.filledSlots
      : null;

  const currency = tier.currency ?? 'XLM';

  return (
    <button
      type="button"
      disabled={isFull}
      onClick={() => !isFull && onSelect?.(tier)}
      aria-pressed={selected}
      aria-disabled={isFull}
      className={[
        'w-full text-left rounded-2xl border p-5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        isFull
          ? 'border-white/10 bg-white/5 opacity-50 cursor-not-allowed'
          : selected
          ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10'
          : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10 cursor-pointer',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-bold text-white text-base">{tier.name}</h3>
        {isFull ? (
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-semibold border border-red-500/30">
            Sold Out
          </span>
        ) : remaining !== null && remaining <= 5 ? (
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-semibold border border-amber-500/30">
            {remaining} left
          </span>
        ) : null}
      </div>

      <p className="text-2xl font-extrabold text-blue-400 mb-1">
        {tier.minAmount.toLocaleString()} <span className="text-base font-semibold text-gray-400">{currency} min</span>
      </p>

      {tier.description && (
        <p className="text-sm text-gray-400 mb-3">{tier.description}</p>
      )}

      {tier.benefits && tier.benefits.length > 0 && (
        <ul className="space-y-1" aria-label="Benefits">
          {tier.benefits.map((b) => (
            <li key={b} className="flex items-center gap-2 text-sm text-gray-300">
              <span aria-hidden="true" className="text-blue-400">✓</span>
              {b}
            </li>
          ))}
        </ul>
      )}

      {tier.maxContributors !== undefined && (
        <p className="mt-3 text-xs text-gray-500">
          {tier.filledSlots ?? 0} / {tier.maxContributors} sponsors
        </p>
      )}
    </button>
  );
}
