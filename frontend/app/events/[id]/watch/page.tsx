'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdaptiveStreamPlayer } from '@/components/streaming/AdaptiveStreamPlayer';

export default function WatchEvent({ params }: { params: { id: string } }) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setSrc(''); setError('');
    void fetch(`/api/proxy/streaming/events/${encodeURIComponent(params.id)}/playback`, {
      credentials: 'include', signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to watch this event.' :
        response.status === 403 ? 'A ticket is required to watch this event.' : 'The stream is not available yet.');
      const data = await response.json();
      if (!controller.signal.aborted) setSrc(data.playbackUrl);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [params.id]);
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
    <Link href={`/events/${params.id}`}>Back to event</Link>
    <h1 className="text-3xl font-bold">Watch event</h1>
    {error ? <p role="alert">{error}</p> : src ? <AdaptiveStreamPlayer eventId={params.id} src={src} /> :
      <div role="status" className="aspect-video animate-pulse rounded-xl bg-gray-200">Loading stream…</div>}
  </main>;
}
