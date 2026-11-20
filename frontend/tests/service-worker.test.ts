// @vitest-environment node
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, it, expect, vi } from 'vitest';

// The service worker is a classic (non-module) script, so it is evaluated in a
// sandbox with the globals it expects. This lets us actually drive the install,
// fetch and message handlers instead of asserting on the source text.
const SOURCE = readFileSync(
  fileURLToPath(new URL('../public/sw.js', import.meta.url)),
  'utf8',
);

interface SwEvent {
  waitUntil?: (promise: Promise<unknown>) => void;
  respondWith?: (promise: Promise<Response | undefined>) => void;
  data?: unknown;
  ports?: Array<{ postMessage: (message: unknown) => void }>;
  request?: {
    url: string;
    method: string;
    mode?: string;
    headers: Headers;
    clone: () => unknown;
  };
}

interface RequestOptions {
  method?: string;
  mode?: string;
  headers?: Record<string, string>;
}

function loadServiceWorker(
  failingAssets: string[] = [],
  fetchImpl: ReturnType<typeof vi.fn> = vi.fn(),
) {
  const listeners: Record<string, (event: SwEvent) => void> = {};
  const addCalls: string[] = [];

  const cache = {
    add: vi.fn(async (asset: string) => {
      addCalls.push(asset);
      if (failingAssets.includes(asset)) {
        throw new TypeError(`Failed to fetch ${asset}`);
      }
    }),
    put: vi.fn(async (..._args: unknown[]) => undefined),
    match: vi.fn(async (..._args: unknown[]): Promise<unknown> => undefined),
  };

  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => []),
    delete: vi.fn(async (..._args: unknown[]) => true),
    match: vi.fn(async (..._args: unknown[]): Promise<unknown> => undefined),
  };

  const self = {
    addEventListener: (type: string, handler: (event: SwEvent) => void) => {
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
  )(self, caches, fetchImpl, URL, Headers, Response, {});

  const runInstall = async (): Promise<PromiseSettledResult<unknown>[]> => {
    const event: SwEvent = { waitUntil: vi.fn() };
    listeners.install(event);
    // The install handler passes a single promise to waitUntil.
    const promise = (event.waitUntil as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as Promise<PromiseSettledResult<unknown>[]>;
    return promise;
  };

  const runFetch = (path: string, options: RequestOptions = {}) => {
    const request = {
      url: new URL(path, 'https://lumentix.example').toString(),
      method: options.method ?? 'GET',
      mode: options.mode,
      headers: new Headers(options.headers),
      clone() {
        return request;
      },
    };
    const event: SwEvent = { request, respondWith: vi.fn() };
    listeners.fetch(event);
    const respondWithMock = event.respondWith as unknown as
      | { mock: { calls: unknown[][] } }
      | undefined;
    const promise = respondWithMock?.mock.calls[0]?.[0];
    return { event, response: promise as Promise<Response | undefined> | undefined };
  };

  const runMessage = (data: unknown): Promise<unknown> => {
    const event: SwEvent = { data, waitUntil: vi.fn() };
    listeners.message(event);
    return (event.waitUntil as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as Promise<unknown>;
  };

  const workerScope = self as unknown as Record<string, unknown>;
  return {
    listeners,
    addCalls,
    runInstall,
    runFetch,
    runMessage,
    cache,
    caches,
    fetchImpl,
    self: workerScope,
  };
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

describe('service worker caching rules (#1613)', () => {
  it('never intercepts or caches /api/auth/me', async () => {
    const { runFetch, fetchImpl, cache } = loadServiceWorker();

    const { event } = runFetch('/api/auth/me', {
      headers: { accept: 'application/json' },
    });

    expect(event.respondWith).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('never intercepts or caches /api/proxy/* requests', async () => {
    const { runFetch, fetchImpl, cache } = loadServiceWorker();

    const { event } = runFetch('/api/proxy/my-tickets', {
      headers: { accept: 'application/json' },
    });

    expect(event.respondWith).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('serves immutable build assets cache-first', async () => {
    const { runFetch, caches } = loadServiceWorker();
    const cached = new Response('cached-build-output');
    caches.match.mockResolvedValueOnce(cached);

    const { response } = runFetch('/_next/static/chunks/app.js');
    await expect(response).resolves.toBe(cached);
  });

  it('does not store responses marked no-store or private', async () => {
    const { runFetch, fetchImpl, cache } = loadServiceWorker();
    fetchImpl.mockResolvedValueOnce(
      new Response('secret', { headers: { 'cache-control': 'no-store' } }),
    );

    const { response } = runFetch('/_next/static/chunks/app.js');
    await response;

    expect(cache.put).not.toHaveBeenCalled();
  });

  it('does not store responses that set cookies', async () => {
    const { runFetch, fetchImpl, cache } = loadServiceWorker();
    const responseWithCookie = {
      status: 200,
      headers: {
        get: () => null,
        has: (name: string) => name.toLowerCase() === 'set-cookie',
      },
      clone: () => responseWithCookie,
    };
    fetchImpl.mockResolvedValueOnce(responseWithCookie);

    const { response } = runFetch('/_next/static/chunks/app.js');
    await response;

    expect(cache.put).not.toHaveBeenCalled();
  });

  it('falls back to the offline page for a failed navigation', async () => {
    const { runFetch, fetchImpl, caches } = loadServiceWorker();
    const offline = new Response('offline');
    fetchImpl.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    caches.match.mockResolvedValueOnce(offline);

    const { response } = runFetch('/events', { mode: 'navigate' });

    await expect(response).resolves.toBe(offline);
    expect(caches.match).toHaveBeenCalledWith('/offline');
  });

  it('clears the user data cache on logout without touching the shell', async () => {
    const { runMessage, caches } = loadServiceWorker();

    await runMessage({ type: 'CLEAR_USER_CACHES' });

    expect(caches.delete).toHaveBeenCalledWith('lumentix-data-v1');
    expect(caches.delete).not.toHaveBeenCalledWith('lumentix-v3');
  });
});

describe('offline event browsing aliases (#1549)', () => {
  it('exposes the three issue-named service worker functions', () => {
    const { self } = loadServiceWorker();

    expect(typeof self.precache_event_data).toBe('function');
    expect(typeof self.serve_offline_listing).toBe('function');
    expect(typeof self.queue_background_sync).toBe('function');
  });
});
