import type { Page } from '@playwright/test';

/**
 * Inject a fake Freighter API onto the window so wallet flows can run without
 * the real browser extension.
 */
export async function mockFreighter(page: Page, publicKey = 'GFAKEFREIGHTERPUBLICKEY0000000000000000000000000000000000') {
  await page.addInitScript((pk) => {
    // Minimal Freighter surface used by @stellar/freighter-api.
    (window as unknown as Record<string, unknown>).freighterApi = {
      isConnected: async () => true,
      requestAccess: async () => pk,
      getAddress: async () => ({ address: pk }),
      getNetwork: async () => 'TESTNET',
      getNetworkDetails: async () => ({ network: 'TESTNET' }),
      signTransaction: async (xdr: string) => `signed:${xdr}`,
    };
  }, publicKey);
}

/** Seed an auth cookie so protected routes are reachable in tests. */
export async function seedAuthCookie(page: Page, baseURL: string) {
  const url = new URL(baseURL);
  await page.context().addCookies([
    {
      name: 'access_token',
      // A JWT-shaped token with a far-future exp and a "user" role.
      value:
        'header.' +
        btoa(JSON.stringify({ sub: 'u1', role: 'user', exp: 9999999999 }))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '') +
        '.sig',
      domain: url.hostname,
      path: '/',
    },
  ]);
}
