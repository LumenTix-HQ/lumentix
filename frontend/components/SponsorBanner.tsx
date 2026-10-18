'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useSponsorBanners } from '@/hooks/useSponsorBanners';

const ROTATION_INTERVAL_MS = 8000;

interface SponsorBannerProps {
  eventId: string;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
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
  // Rotation stops while the viewer hovers/focuses the banner, when they ask
  // for reduced motion, or when they press the pause button.
  const [userPaused, setUserPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  // One impression per sponsor per page view, so rotating back to a banner
  // (or re-rendering) doesn't inflate its count.
  const recordedImpressions = useRef(new Set<string>());

  useEffect(() => setReducedMotion(prefersReducedMotion()), []);

  const paused = userPaused || interacting || reducedMotion;

  useEffect(() => {
    if (banners.length <= 1 || paused) return;
    const timer = setInterval(() => {
      setActiveIndex((i) => (i + 1) % banners.length);
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [banners.length, paused]);

  const active = banners[activeIndex % Math.max(banners.length, 1)];

  useEffect(() => {
    if (!active || recordedImpressions.current.has(active.id)) return;

    const record = () => {
      if (document.visibilityState !== 'visible' || recordedImpressions.current.has(active.id)) {
        return;
      }
      recordedImpressions.current.add(active.id);
      recordImpression(active.id);
    };

    record();
    // A banner shown in a background tab only counts once the tab is seen.
    document.addEventListener('visibilitychange', record);
    return () => document.removeEventListener('visibilitychange', record);
  }, [active, recordImpression]);

  if (loading || !active) return null;

  const name = active.displayName ?? 'our sponsor';
  const content = (
    <>
      {active.logoUrl && (
        <SponsorLogo src={active.logoUrl} alt={active.displayName ?? 'Sponsor logo'} />
      )}
      <span className="text-sm text-gray-300">
        Sponsored by <span className="font-semibold text-white">{name}</span>
      </span>
    </>
  );
  const itemClass =
    'flex flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 transition-colors hover:border-white/30 hover:bg-white/10';

  return (
    <section
      aria-label="Sponsors"
      aria-roledescription={banners.length > 1 ? 'carousel' : undefined}
      className="flex items-center gap-2"
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocus={() => setInteracting(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setInteracting(false);
        }
      }}
    >
      <div
        className="flex flex-1"
        aria-roledescription={banners.length > 1 ? 'slide' : undefined}
        aria-label={
          banners.length > 1 ? `${activeIndex + 1} of ${banners.length}` : undefined
        }
      >
        {active.websiteUrl ? (
          <a
            href={active.websiteUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onClick={() => recordClick(active.id)}
            aria-label={`Sponsored by ${name} (opens in a new tab)`}
            className={itemClass}
          >
            {content}
          </a>
        ) : (
          <div className={itemClass}>{content}</div>
        )}
      </div>
      {banners.length > 1 && !reducedMotion && (
        <button
          type="button"
          onClick={() => setUserPaused((p) => !p)}
          aria-label={userPaused ? 'Resume sponsor rotation' : 'Pause sponsor rotation'}
          className="rounded-lg border border-white/10 px-2 py-1 text-xs text-gray-400 hover:bg-white/10"
        >
          {userPaused ? '▶' : '❚❚'}
        </button>
      )}
    </section>
  );
}
