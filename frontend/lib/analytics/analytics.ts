const OPT_OUT_KEY = 'lumentix_analytics_opt_out';

function isOptedOut(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(OPT_OUT_KEY) === 'true';
}

export function setAnalyticsOptOut(optOut: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(OPT_OUT_KEY, String(optOut));
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
