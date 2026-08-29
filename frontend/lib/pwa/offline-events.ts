/**
 * Client-side half of the offline event browsing support in `public/sw.js`
 * (issue #996).
 *
 * The service worker decides *how* to cache; the page decides *what* is worth
 * caching, because only the page knows which events the user is actually
 * looking at.
 */

const PRECACHE_MESSAGE = 'PRECACHE_EVENT_DATA';
const REPLAY_MESSAGE = 'REPLAY_QUEUED_REQUESTS';

export interface PrecacheResult {
  cached: number;
  failed: number;
}

function controller(): ServiceWorker | null {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  return navigator.serviceWorker.controller;
}

/**
 * Ask the service worker to store the given event/ticket endpoints for
 * offline use.
 *
 * Resolves with what was cached, or `null` when there is no active worker —
 * during the very first page load before the worker takes control, in a
 * browser without service workers, or during SSR. Callers should treat a
 * `null` as "offline browsing is simply not available", never as an error.
 */
export function precacheEventData(
  urls: string[],
): Promise<PrecacheResult | null> {
  const worker = controller();
  if (!worker || urls.length === 0) return Promise.resolve(null);

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    // Do not leave the caller hanging if the worker is terminated mid-precache.
    const timeout = setTimeout(() => resolve(null), 10_000);

    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      const data = event.data ?? {};
      resolve({ cached: data.cached ?? 0, failed: data.failed ?? 0 });
    };

    worker.postMessage({ type: PRECACHE_MESSAGE, urls }, [channel.port2]);
  });
}

/**
 * Nudge the worker to flush anything queued while offline.
 *
 * Background Sync already handles this where it exists; this is the fallback
 * for browsers that do not implement it, driven by the `online` event.
 */
export function replayQueuedRequests(): void {
  controller()?.postMessage({ type: REPLAY_MESSAGE });
}

/**
 * Build the endpoint list for a set of events, so a listing page can hand the
 * worker exactly the detail pages a user might open next.
 */
export function eventDataUrls(eventIds: string[], apiBase = ''): string[] {
  return [
    `${apiBase}/api/events`,
    ...eventIds.map((id) => `${apiBase}/api/events/${id}`),
  ];
}
