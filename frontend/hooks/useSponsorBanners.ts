'use client';

import { useCallback, useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface SponsorBanner {
  id: string;
  displayName: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
}

export function useSponsorBanners(eventId: string) {
  const [banners, setBanners] = useState<SponsorBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBanners() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/events/${eventId}/sponsors/banners`);
        if (!res.ok) {
          throw new Error(`Failed to load sponsor banners (${res.status})`);
        }
        const data = await res.json();
        if (!cancelled) setBanners(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load sponsor banners');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (eventId) loadBanners();

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const recordImpression = useCallback((sponsorId: string) => {
    fetch(`${API_BASE}/sponsors/${sponsorId}/impression`, { method: 'POST' }).catch(() => {
      // Best-effort; a missed impression shouldn't disrupt the banner display.
    });
  }, []);

  const recordClick = useCallback((sponsorId: string) => {
    fetch(`${API_BASE}/sponsors/${sponsorId}/click`, { method: 'POST' }).catch(() => {
      // Best-effort; a missed click shouldn't block navigation to the sponsor's site.
    });
  }, []);

  return { banners, loading, error, recordImpression, recordClick };
}
