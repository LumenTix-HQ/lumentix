'use client';

import React, { useEffect, useState } from 'react';
import { useReferral } from '@/hooks/useReferral';
import { RewardType } from '@/lib/referral';

/**
 * Social Sharing Referral Section
 *
 * Renders a "Share & Earn" card that lets users generate a referral link,
 * copy it, share it on social networks (Twitter/X, Telegram, WhatsApp),
 * and view their referral statistics.
 */
export function ReferralSection({ eventId, eventTitle }: { eventId?: string; eventTitle?: string }) {
  const {
    link,
    stats,
    isLoading,
    error,
    generate,
    refresh,
    copyToClipboard,
    shareOnTwitter,
    shareOnTelegram,
    shareOnWhatsApp,
  } = useReferral();

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCopy = async () => {
    const ok = await copyToClipboard();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">🎁</span>
        <div>
          <h3 className="text-lg font-bold text-white">Share & Earn</h3>
          <p className="text-sm text-gray-400">
            Invite friends and earn <strong>100 loyalty points</strong> per ticket purchase!
          </p>
        </div>
      </div>

      {/* Generate button */}
      {!link && (
        <button
          onClick={() => generate(eventId, RewardType.LOYALTY_POINTS)}
          disabled={isLoading}
          className="w-full rounded-xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Generating…' : 'Generate My Referral Link'}
        </button>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-4 py-2">{error}</p>
      )}

      {/* Generated link display */}
      {link && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link.link}
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-200 font-mono truncate"
            />
            <button
              onClick={handleCopy}
              className="shrink-0 rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-600 transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          <p className="text-xs text-gray-500">
            Code: <span className="font-mono text-purple-400">{link.code}</span> · Expires:{' '}
            {link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : '—'}
          </p>

          {/* Social share buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => shareOnTwitter(eventTitle)}
              className="flex-1 rounded-lg bg-sky-600/20 border border-sky-500/30 px-3 py-2 text-sm font-medium text-sky-300 hover:bg-sky-600/30 transition-colors"
            >
              𝕏 / Twitter
            </button>
            <button
              onClick={() => shareOnTelegram(eventTitle)}
              className="flex-1 rounded-lg bg-blue-600/20 border border-blue-500/30 px-3 py-2 text-sm font-medium text-blue-300 hover:bg-blue-600/30 transition-colors"
            >
              Telegram
            </button>
            <button
              onClick={() => shareOnWhatsApp(eventTitle)}
              className="flex-1 rounded-lg bg-green-600/20 border border-green-500/30 px-3 py-2 text-sm font-medium text-green-300 hover:bg-green-600/30 transition-colors"
            >
              WhatsApp
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-800">
          <div className="text-center">
            <div className="text-xl font-bold text-purple-400">{stats.convertedCount}</div>
            <div className="text-xs text-gray-500">Conversions</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-yellow-400">{stats.totalPointsEarned}</div>
            <div className="text-xs text-gray-500">Points Earned</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-green-400">{stats.pendingCount}</div>
            <div className="text-xs text-gray-500">Pending</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReferralSection;
