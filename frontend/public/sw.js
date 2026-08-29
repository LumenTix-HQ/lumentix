const CACHE_NAME = 'lumentix-v1';

// Event listings and ticket details live in their own cache, separate from the
// app shell. They are versioned and evicted independently: a shell release
// should not throw away a user's offline event data, and stale event data
// should not survive a shell upgrade just because the shell did.
const DATA_CACHE_NAME = 'lumentix-data-v1';
const CURRENT_CACHES = [CACHE_NAME, DATA_CACHE_NAME];

const STATIC_ASSETS = [
  '/',
  '/offline',
  '/events',
  '/my-tickets',
  '/manifest.ts',
];

// Paths whose responses are worth keeping for offline browsing.
const CACHEABLE_DATA_PATHS = [/\/events(\/|$|\?)/, /\/tickets(\/|$|\?)/];

const SYNC_TAG = 'lumentix-queued-requests';
const SYNC_DB_NAME = 'lumentix-sync';
const SYNC_STORE = 'requests';

// ── Lifecycle ───────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !CURRENT_CACHES.includes(k)).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Offline event browsing (#996) ───────────────────────────────────────────

/** True for the event/ticket data requests worth keeping offline. */
function isEventData(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  const isApi =
    url.pathname.startsWith('/api/') ||
    request.headers.get('accept') === 'application/json';
  if (!isApi) return false;
  return CACHEABLE_DATA_PATHS.some((pattern) => pattern.test(url.pathname));
}

/**
 * Warm the data cache with event listings and ticket details.
 *
 * Called from the page (via a `PRECACHE_EVENT_DATA` message) once a listing
 * has rendered, so the URLs precached are the ones this user actually looks
 * at rather than a guess baked into the worker.
 *
 * A failed URL does not fail the batch — precaching is best-effort, and one
 * 404 among twenty events should not leave the other nineteen unavailable.
 */
async function precacheEventData(urls) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return { cached: 0, failed: 0 };
  }

  const cache = await caches.open(DATA_CACHE_NAME);
  let cached = 0;
  let failed = 0;

  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { credentials: 'same-origin' });
        if (!response.ok) {
          failed += 1;
          return;
        }
        await cache.put(url, response.clone());
        cached += 1;
      } catch (err) {
        failed += 1;
      }
    })
  );

  return { cached, failed };
}

/**
 * Network-first with a cache fallback, for event and ticket data.
 *
 * Network-first rather than cache-first because a stale ticket or a sold-out
 * event shown as available is worse than a slightly slower load. The cache is
 * what the user gets when the network is genuinely unavailable.
 *
 * When there is no cached copy either, this answers with a JSON body carrying
 * `offline: true` and HTTP 503 rather than letting the fetch reject, so the UI
 * can render an "unavailable offline" state instead of a generic error.
 */
async function serveOfflineListing(request) {
  const cache = await caches.open(DATA_CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      // Mark the response so the UI can show "last updated offline" rather
      // than presenting cached data as live.
      const headers = new Headers(cached.headers);
      headers.set('X-Lumentix-Offline', 'true');
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }

    return new Response(
      JSON.stringify({
        offline: true,
        error: 'This content is not available offline yet.',
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'X-Lumentix-Offline': 'true',
        },
      }
    );
  }
}

// ── Background sync (#996) ──────────────────────────────────────────────────

function openSyncDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SYNC_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        db.createObjectStore(SYNC_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore(mode, fn) {
  return openSyncDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(SYNC_STORE, mode);
        const result = fn(tx.objectStore(SYNC_STORE));
        tx.oncomplete = () => resolve(result.result !== undefined ? result.result : result);
        tx.onerror = () => reject(tx.error);
      })
  );
}

/**
 * Persist a request that could not be sent, and ask the browser to replay it
 * when connectivity returns.
 *
 * IndexedDB rather than an in-memory list because the worker is terminated
 * aggressively when idle — anything held in a variable is gone by the time the
 * network is back. Only mutating requests are queued; a failed GET is a read
 * the user can simply repeat.
 */
async function queueBackgroundSync(request) {
  const body = await request.clone().text();
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  await withStore('readwrite', (store) =>
    store.add({
      url: request.url,
      method: request.method,
      headers,
      body: body || null,
      queuedAt: Date.now(),
    })
  );

  if ('sync' in self.registration) {
    try {
      await self.registration.sync.register(SYNC_TAG);
    } catch (err) {
      // Background Sync is unavailable (Safari, or permission denied). The
      // request stays queued and is replayed on the next `online` event.
    }
  }

  return true;
}

/** Replay everything queued, dropping each entry only once it has been sent. */
async function replayQueuedRequests() {
  const queued = await withStore('readonly', (store) => store.getAll());
  if (!queued || queued.length === 0) return;

  for (const entry of queued) {
    try {
      const response = await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.body,
        credentials: 'same-origin',
      });
      // A 4xx will never succeed on retry, so drop it rather than replaying
      // it forever; a 5xx or a network error is left queued.
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        await withStore('readwrite', (store) => store.delete(entry.id));
      }
    } catch (err) {
      // Still offline — stop here and leave the rest of the queue intact so
      // ordering is preserved on the next attempt.
      break;
    }
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayQueuedRequests());
  }
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'PRECACHE_EVENT_DATA') {
    event.waitUntil(
      precacheEventData(data.urls).then((result) => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ type: 'PRECACHE_RESULT', ...result });
        }
      })
    );
  }
  if (data.type === 'REPLAY_QUEUED_REQUESTS') {
    event.waitUntil(replayQueuedRequests());
  }
});

// ── Fetch ───────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (isEventData(request)) {
    event.respondWith(serveOfflineListing(request));
    return;
  }

  // A mutation that fails offline is queued rather than lost, and the caller
  // is told so explicitly (202) instead of being handed a generic failure.
  if (request.method !== 'GET') {
    event.respondWith(
      fetch(request.clone()).catch(async () => {
        await queueBackgroundSync(request);
        return new Response(
          JSON.stringify({
            queued: true,
            message: 'Saved offline — this will be sent when you reconnect.',
          }),
          {
            status: 202,
            headers: {
              'Content-Type': 'application/json',
              'X-Lumentix-Queued': 'true',
            },
          }
        );
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/offline'));
    })
  );
});

// ── Push notifications ──────────────────────────────────────────────────────
// Display an incoming push message (event reminders, schedule changes, payment
// confirmations). The payload is JSON: { title, body, url, tag }.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { body: event.data && event.data.text ? event.data.text() : '' };
  }

  const title = payload.title || 'Lumentix';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/icon-192x192.png',
    tag: payload.tag,
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    })
  );
});
