import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A real localStorage-backed store (the global mock in setup.ts is a no-op).
function installStore() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  return store;
}

describe('analytics consent (opt-in)', () => {
  beforeEach(() => {
    vi.resetModules();
    installStore();
    process.env.NEXT_PUBLIC_ANALYTICS_URL = 'https://analytics.example';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_ANALYTICS_URL;
  });

  it('defaults to opted-out with no decision recorded', async () => {
    const a = await import('@/lib/analytics/analytics');
    expect(a.hasAnalyticsDecision()).toBe(false);
    expect(a.getAnalyticsOptOut()).toBe(true);
  });

  it('does NOT send analytics before consent is granted', async () => {
    const a = await import('@/lib/analytics/analytics');
    await a.analytics.walletConnected();
    a.trackPageView('/secret-page');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends analytics only after consent is granted', async () => {
    const a = await import('@/lib/analytics/analytics');
    a.setAnalyticsConsent('granted');
    await a.analytics.paymentConfirmed('XLM');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('declining consent keeps analytics disabled', async () => {
    const a = await import('@/lib/analytics/analytics');
    a.setAnalyticsConsent('denied');
    expect(a.hasAnalyticsDecision()).toBe(true);
    await a.analytics.walletConnected();
    a.trackPageView('/x');
    expect(fetch).not.toHaveBeenCalled();
  });
});
