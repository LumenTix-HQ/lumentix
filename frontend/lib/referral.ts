/**
 * Frontend utilities for the Social Referral Incentive Program.
 *
 * These functions mirror the backend `SocialService` referral methods and
 * bridge the Next.js client to the NestJS `/social/referral/*` endpoints.
 *
 * @module lib/referral
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

// ─── Types ───────────────────────────────────────────────────────────────────

export enum ReferralStatus {
  PENDING = 'pending',
  CONVERTED = 'converted',
  EXPIRED = 'expired',
}

export enum RewardType {
  LOYALTY_POINTS = 'loyalty_points',
  DISCOUNT_CODE = 'discount_code',
}

export interface ReferralLink {
  id: string;
  referrerId: string;
  code: string;
  link: string;
  status: ReferralStatus;
  rewardType: RewardType;
  rewardValue: number;
  eventId: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ReferralConversionResult {
  id: string;
  code: string;
  status: ReferralStatus;
  refereeId: string;
  ticketId: string;
  convertedAt: string;
}

export interface ReferralRewardResult {
  referral: ReferralLink;
  rewardDetails: {
    type: RewardType;
    value: number;
    discountCode?: string;
  };
}

export interface ReferralStats {
  totalCreated: number;
  convertedCount: number;
  pendingCount: number;
  totalPointsEarned: number;
  discountCodesEarned: number;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

async function authFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('lumentix_token')
      : null;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as Record<string, string>).message ?? `Request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Core Functions (issue #1536) ────────────────────────────────────────────

/**
 * Generate a unique referral link for the authenticated user.
 *
 * The link encodes a tracking code (`?ref=REF-XXXX`) that the backend uses
 * to attribute future ticket purchases to this referrer.
 */
export async function generate_referral_link(
  eventId?: string,
  rewardType?: RewardType,
): Promise<ReferralLink> {
  return authFetch<ReferralLink>('/social/referral/generate', {
    method: 'POST',
    body: JSON.stringify({ eventId, rewardType }),
  });
}

/**
 * Track a referral conversion when a referred user completes a ticket
 * purchase. This awards the referrer with loyalty points or a discount code.
 */
export async function track_referral_conversion(
  referralCode: string,
  ticketId: string,
  eventId?: string,
): Promise<ReferralConversionResult> {
  return authFetch<ReferralConversionResult>('/social/referral/convert', {
    method: 'POST',
    body: JSON.stringify({ referralCode, ticketId, eventId }),
  });
}

/**
 * Manually issue the reward for a converted referral.
 *
 * In practice the backend issues the reward automatically upon conversion,
 * but this endpoint allows re-issuing or overriding the reward type.
 */
export async function issue_referral_reward(
  referralId: string,
  rewardType?: RewardType,
): Promise<ReferralRewardResult> {
  return authFetch<ReferralRewardResult>(
    `/social/referral/reward/${referralId}`,
    {
      method: 'POST',
      body: JSON.stringify({ referralId, rewardType }),
    },
  );
}

// CamelCase aliases
export const generateReferralLink = generate_referral_link;
export const trackReferralConversion = track_referral_conversion;
export const issueReferralReward = issue_referral_reward;

// ─── URL & SessionStorage Helpers ────────────────────────────────────────────

const REFERRAL_STORAGE_KEY = 'lumentix_referral_code';

/** Extract a `?ref=CODE` query parameter from the current URL. */
export function getReferralCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('ref') ?? null;
}

/** Persist the referral code in sessionStorage so it survives page navigations
 *  within the same tab until the user completes checkout. */
export function storeReferralCode(code: string): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(REFERRAL_STORAGE_KEY, code);
  }
}

/** Retrieve a previously stored referral code. */
export function getStoredReferralCode(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(REFERRAL_STORAGE_KEY);
}

/** Clear the stored referral code (call after a successful conversion). */
export function clearReferralCode(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
  }
}

// ─── Read-only helpers ───────────────────────────────────────────────────────

/** Fetch all referral links the authenticated user has generated. */
export async function getMyReferrals(): Promise<ReferralLink[]> {
  return authFetch<ReferralLink[]>('/social/referral/my-referrals');
}

/** Fetch aggregate referral statistics for the authenticated user. */
export async function getReferralStats(): Promise<ReferralStats> {
  return authFetch<ReferralStats>('/social/referral/stats');
}

/** Validate that a referral code exists and is still active. */
export async function validateReferralCode(
  code: string,
): Promise<ReferralLink> {
  return authFetch<ReferralLink>(`/social/referral/validate/${code}`);
}

// ─── Social Share Link Builders ──────────────────────────────────────────────

/** Build a Twitter/X share intent URL. */
export function buildTwitterShareUrl(link: string, eventTitle?: string): string {
  const text = eventTitle
    ? `Check out "${eventTitle}" on LumenTix — get your tickets now! 🎟️`
    : 'Get your tickets on LumenTix! 🎟️';
  const params = new URLSearchParams({ text, url: link });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

/** Build a Telegram share URL. */
export function buildTelegramShareUrl(link: string, eventTitle?: string): string {
  const text = eventTitle
    ? `Check out "${eventTitle}" on LumenTix!`
    : 'Get your tickets on LumenTix!';
  const params = new URLSearchParams({ url: link, text });
  return `https://t.me/share/url?${params.toString()}`;
}

/** Build a WhatsApp share URL. */
export function buildWhatsAppShareUrl(link: string, eventTitle?: string): string {
  const text = eventTitle
    ? `Hey! Check out "${eventTitle}" on LumenTix — here's my referral link: ${link}`
    : `Hey! Get your tickets on LumenTix: ${link}`;
  const params = new URLSearchParams({ text });
  return `https://wa.me/?${params.toString()}`;
}
