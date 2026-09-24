'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useSponsorBanners } from '@/hooks/useSponsorBanners';

const ROTATION_INTERVAL_MS = 8000;

interface SponsorBannerProps {
  eventId: string;
}

function SponsorLogo({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-xs text-gray-400"
        aria-hidden="true"
      >
        ★
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={40}
      height={40}
      sizes="40px"
      className="h-10 w-10 rounded-lg object-contain"
      onError={() => setFailed(true)}
    />
  );
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
        <SponsorLogo src={active.logoUrl} alt={active.displayName ?? 'Sponsor logo'} />
      )}
      <span className="text-sm text-gray-300">
        Sponsored by <span className="font-semibold text-white">{active.displayName ?? 'our sponsor'}</span>
      </span>
    </a>
  );
}
