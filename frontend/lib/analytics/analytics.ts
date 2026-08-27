const CONSENT_KEY = 'lumentix_analytics_consent';
// Legacy key kept so we can migrate anyone who previously toggled opt-out.
const LEGACY_OPT_OUT_KEY = 'lumentix_analytics_opt_out';

export type ConsentDecision = 'granted' | 'denied';

/** Returns the stored consent decision, or null if the user hasn't chosen yet. */
export function getAnalyticsConsent(): ConsentDecision | null {
  if (typeof window === 'undefined') return null;
  const value = localStorage.getItem(CONSENT_KEY);
  if (value === 'granted' || value === 'denied') return value;
  // Migrate a legacy explicit opt-out into a denied decision.
  const legacy = localStorage.getItem(LEGACY_OPT_OUT_KEY);
  if (legacy === 'true') return 'denied';
  if (legacy === 'false') return 'granted';
  return null;
}

/** Persist an explicit consent decision. */
export function setAnalyticsConsent(decision: ConsentDecision): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CONSENT_KEY, decision);
}

/** Whether the user has made any explicit choice yet (used to gate the banner). */
export function hasAnalyticsDecision(): boolean {
  return getAnalyticsConsent() !== null;
}

/**
 * Opt-IN model: analytics is considered opted-out unless the user has
 * explicitly granted consent. No page/URL data is sent before that.
 */
function isOptedOut(): boolean {
  return getAnalyticsConsent() !== 'granted';
}

// Back-compat helpers used by the profile settings toggle.
export function setAnalyticsOptOut(optOut: boolean): void {
  setAnalyticsConsent(optOut ? 'denied' : 'granted');
}

export function getAnalyticsOptOut(): boolean {
  return isOptedOut();
}

async function sendEvent(name: string, props?: Record<string, unknown>): Promise<void> {
  const url = process.env.NEXT_PUBLIC_ANALYTICS_URL;
  if (!url || isOptedOut() || typeof window === 'undefined') return;
  try {
    await fetch(`${url}/api/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url: window.location.href, domain: window.location.hostname, props }),
    });
  } catch {
    // analytics must never break the app
  }
}

export function trackPageView(pageUrl: string): void {
  const url = process.env.NEXT_PUBLIC_ANALYTICS_URL;
  if (!url || isOptedOut() || typeof window === 'undefined') return;
  fetch(`${url}/api/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'pageview', url: pageUrl, domain: window.location.hostname }),
  }).catch(() => {});
}

export const analytics = {
  walletConnected: () => sendEvent('wallet_connected'),
  paymentInitiated: (currency: string) => sendEvent('payment_initiated', { currency }),
  paymentConfirmed: (currency: string) => sendEvent('payment_confirmed', { currency }),
  paymentFailed: (reason: string) => sendEvent('payment_failed', { reason }),
  refundRequested: () => sendEvent('refund_requested'),
};
