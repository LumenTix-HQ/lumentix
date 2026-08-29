'use client';

import { useEffect, useState } from 'react';
import { useSponsorBanners } from '@/hooks/useSponsorBanners';

const ROTATION_INTERVAL_MS = 8000;

interface SponsorBannerProps {
  eventId: string;
}

export function SponsorBanner({ eventId }: SponsorBannerProps) {
  const { banners, loading, recordImpression, recordClick } = useSponsorBanners(eventId);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((i) => (i + 1) % banners.length);
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [banners.length]);

  const active = banners[activeIndex];

  useEffect(() => {
    if (active) recordImpression(active.id);
  }, [active, recordImpression]);

  if (loading || !active) return null;

  return (
    <a
      href={active.websiteUrl ?? undefined}
      target="_blank"
      rel="noopener noreferrer sponsored"
      onClick={() => recordClick(active.id)}
      aria-label={`Sponsored by ${active.displayName ?? 'sponsor'}`}
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 transition-colors hover:border-white/30 hover:bg-white/10"
    >
      {active.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={active.logoUrl} alt={active.displayName ?? 'Sponsor logo'} className="h-10 w-10 rounded-lg object-contain" />
      )}
      <span className="text-sm text-gray-300">
        Sponsored by <span className="font-semibold text-white">{active.displayName ?? 'our sponsor'}</span>
      </span>
    </a>
  );
}
