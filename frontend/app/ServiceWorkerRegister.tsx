'use client';

import { useEffect } from 'react';

import { replayQueuedRequests } from '@/lib/pwa/offline-events';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    // Register in all environments so the push-notification subscription flow
    // (which needs an active service-worker registration) is available.
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch(() => {});

    // Background Sync replays queued writes on its own where it exists, but
    // Safari has no such API — so also flush the queue whenever the browser
    // tells us connectivity is back.
    const onOnline = () => replayQueuedRequests();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  return null;
}
