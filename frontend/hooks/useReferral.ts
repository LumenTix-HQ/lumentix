'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  generate_referral_link,
  getReferralCodeFromUrl,
  storeReferralCode,
  getStoredReferralCode,
  getMyReferrals,
  getReferralStats,
  buildTwitterShareUrl,
  buildTelegramShareUrl,
  buildWhatsAppShareUrl,
  type ReferralLink,
  type ReferralStats,
  type RewardType,
} from '@/lib/referral';

export interface UseReferralReturn {
  /** The most recently generated referral link, if any. */
  link: ReferralLink | null;
  /** Referral code extracted from the URL on mount. */
  inboundCode: string | null;
  /** All referrals created by the current user. */
  referrals: ReferralLink[];
  /** Aggregate statistics. */
  stats: ReferralStats | null;
  /** Whether a generate or fetch request is in-flight. */
  isLoading: boolean;
  /** Error from the last operation. */
  error: string | null;

  /** Generate a new referral link. */
  generate: (eventId?: string, rewardType?: RewardType) => Promise<void>;
  /** Refresh the referral list and stats. */
  refresh: () => Promise<void>;
  /** Copy the referral link to the clipboard. */
  copyToClipboard: () => Promise<boolean>;

  /** Open Twitter/X share intent in a new tab. */
  shareOnTwitter: (eventTitle?: string) => void;
  /** Open Telegram share in a new tab. */
  shareOnTelegram: (eventTitle?: string) => void;
  /** Open WhatsApp share in a new tab. */
  shareOnWhatsApp: (eventTitle?: string) => void;
}

/**
 * React hook for the Social Referral Incentive Program.
 *
 * On mount it checks the URL for `?ref=CODE` and persists it in
 * sessionStorage so it survives page navigations until checkout.
 */
export function useReferral(): UseReferralReturn {
  const [link, setLink] = useState<ReferralLink | null>(null);
  const [inboundCode, setInboundCode] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<ReferralLink[]>([]);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount: capture ?ref=CODE from URL
  useEffect(() => {
    const code = getReferralCodeFromUrl();
    if (code) {
      storeReferralCode(code);
      setInboundCode(code);
    } else {
      const stored = getStoredReferralCode();
      if (stored) setInboundCode(stored);
    }
  }, []);

  const generate = useCallback(
    async (eventId?: string, rewardType?: RewardType) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await generate_referral_link(eventId, rewardType);
        setLink(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to generate referral link';
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [refs, st] = await Promise.all([getMyReferrals(), getReferralStats()]);
      setReferrals(refs);
      setStats(st);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load referral data';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const copyToClipboard = useCallback(async (): Promise<boolean> => {
    if (!link?.link) return false;
    try {
      await navigator.clipboard.writeText(link.link);
      return true;
    } catch {
      return false;
    }
  }, [link]);

  const shareOnTwitter = useCallback(
    (eventTitle?: string) => {
      if (!link?.link) return;
      window.open(buildTwitterShareUrl(link.link, eventTitle), '_blank');
    },
    [link],
  );

  const shareOnTelegram = useCallback(
    (eventTitle?: string) => {
      if (!link?.link) return;
      window.open(buildTelegramShareUrl(link.link, eventTitle), '_blank');
    },
    [link],
  );

  const shareOnWhatsApp = useCallback(
    (eventTitle?: string) => {
      if (!link?.link) return;
      window.open(buildWhatsAppShareUrl(link.link, eventTitle), '_blank');
    },
    [link],
  );

  return {
    link,
    inboundCode,
    referrals,
    stats,
    isLoading,
    error,
    generate,
    refresh,
    copyToClipboard,
    shareOnTwitter,
    shareOnTelegram,
    shareOnWhatsApp,
  };
}
