'use client';

import React from 'react';

export interface SponsorTierData {
  name: string;
  price: number;
  benefits?: string;
  maxSponsors: number;
}

interface SponsorTierPreviewProps {
  tier: SponsorTierData;
  /** 0-based position badge shown on the card */
  index: number;
}

/**
 * Real-time read-only preview card for a single sponsor tier.
 * Updates immediately as the user types into the form.
 */
export default function SponsorTierPreview({ tier, index }: SponsorTierPreviewProps) {
  const tierLabels = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];
  const tierColors = [
    'from-amber-700 to-amber-500',
    'from-gray-400 to-gray-200',
    'from-yellow-500 to-yellow-300',
    'from-cyan-600 to-cyan-300',
    'from-purple-600 to-pink-400',
  ];

  const label = tierLabels[index] ?? `Tier ${index + 1}`;
  const gradient = tierColors[index] ?? 'from-purple-600 to-pink-400';

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4 transition-all">
      {/* Header gradient bar */}
      <div className={`h-1 w-full rounded-full bg-gradient-to-r ${gradient} mb-3`} />

      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="block text-[10px] uppercase tracking-widest text-gray-400 mb-0.5">
            {label}
          </span>
          <h3 className="text-base font-bold text-white truncate max-w-[160px]">
            {tier.name || <span className="text-gray-600 italic">Untitled tier</span>}
          </h3>
        </div>
        <div className="text-right shrink-0">
          <span className={`text-lg font-extrabold text-transparent bg-clip-text bg-gradient-to-r ${gradient}`}>
            ${tier.price > 0 ? tier.price.toLocaleString() : '—'}
          </span>
          <span className="block text-[10px] text-gray-500">min. contribution</span>
        </div>
      </div>

      {tier.benefits && (
        <p className="text-xs text-gray-300 leading-relaxed line-clamp-3 mb-2">
          {tier.benefits}
        </p>
      )}

      <div className="flex items-center gap-1 text-[11px] text-gray-500">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
        </svg>
        <span>Up to {tier.maxSponsors > 0 ? tier.maxSponsors : '—'} sponsor{tier.maxSponsors !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
