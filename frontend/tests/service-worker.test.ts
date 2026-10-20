// @vitest-environment node
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, it, expect, vi } from 'vitest';

// The service worker is a classic (non-module) script, so it is evaluated in a
// sandbox with the globals it expects. This lets us actually drive the install
// event instead of asserting on the source text.
const SOURCE = readFileSync(
  fileURLToPath(new URL('../public/sw.js', import.meta.url)),
  'utf8',
);

interface InstallEvent {
  waitUntil: (promise: Promise<unknown>) => void;
}

function loadServiceWorker(failingAssets: string[] = []) {
  const listeners: Record<string, (event: InstallEvent) => void> = {};
  const addCalls: string[] = [];

  const cache = {
    add: vi.fn(async (asset: string) => {
      addCalls.push(asset);
      if (failingAssets.includes(asset)) {
        throw new TypeError(`Failed to fetch ${asset}`);
      }
    }),
    put: vi.fn(async () => undefined),
    match: vi.fn(async () => undefined),
  };

  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
    match: vi.fn(async () => undefined),
  };

  const self = {
    addEventListener: (type: string, handler: (event: InstallEvent) => void) => {
      listeners[type] = handler;
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(), matchAll: vi.fn(), openWindow: vi.fn() },
    registration: {},
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(
    'self',
    'caches',
    'fetch',
    'URL',
    'Headers',
    'Response',
    'indexedDB',
    SOURCE,
  )(
    self,
    caches,
    vi.fn(),
    URL,
    Headers,
    Response,
    {},
  );

  const runInstall = async (): Promise<PromiseSettledResult<unknown>[]> => {
    const event: InstallEvent = { waitUntil: vi.fn() };
    listeners.install(event);
    // The install handler passes a single promise to waitUntil.
    const promise = (event.waitUntil as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as Promise<PromiseSettledResult<unknown>[]>;
    return promise;
  };

  return { listeners, addCalls, runInstall };
}

describe('service worker install', () => {
  it('precaches the real manifest route and not the phantom /manifest.ts', async () => {
    const { addCalls, runInstall } = loadServiceWorker(['/manifest.ts']);

    await runInstall();

    expect(addCalls).toContain('/manifest.webmanifest');
    expect(addCalls).not.toContain('/manifest.ts');
  });

  it('does not precache auth-gated routes', async () => {
    const { addCalls, runInstall } = loadServiceWorker();

    await runInstall();

    expect(addCalls).not.toContain('/my-tickets');
  });

  it('resolves even when individual assets fail to cache', async () => {
    const { runInstall } = loadServiceWorker([
      '/manifest.webmanifest',
      '/offline',
    ]);

    const results = await runInstall();
    const statuses = results.map((r) => r.status);

    expect(statuses).toContain('rejected');
    // The overall install still settles rather than rejecting.
    expect(statuses).toContain('fulfilled');
  });
});
