'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { detect_viewer_bandwidth, report_buffering_event, switch_bitrate_tier } from '@/lib/streaming/adaptive-bitrate';

export function AdaptiveStreamPlayer({ eventId, src }: { eventId: string; src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<{ label: string; index: number }[]>([]);
  const [quality, setQuality] = useState(-1);
  const [bandwidth, setBandwidth] = useState(0);
  const [error, setError] = useState('');
  const [native, setNative] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setLevels([]); setQuality(-1); setError(''); setNative(false); setBandwidth(0);
    let waitingAt: number | undefined;
    const onWaiting = () => { if (!video.paused && waitingAt === undefined) waitingAt = performance.now(); };
    const onPlaying = () => {
      if (waitingAt !== undefined) {
        void report_buffering_event(eventId, performance.now() - waitingAt,
          playerRef.current ? detect_viewer_bandwidth(playerRef.current) : 0);
        waitingAt = undefined;
      }
    };
    const onPause = () => { waitingAt = undefined; };
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    let player: Hls | undefined;
    if (Hls.isSupported()) {
      player = new Hls({ startLevel: -1 });
      playerRef.current = player;
      player.on(Hls.Events.MANIFEST_PARSED, () => setLevels(player!.levels.map((level, index) => ({
        index, label: `${level.height ? `${level.height}p · ` : ''}${Math.round(level.bitrate / 1000)} kbps`,
      }))));
      player.on(Hls.Events.FRAG_LOADED, () => setBandwidth(detect_viewer_bandwidth(player!)));
      player.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) setError('The stream could not be played. Reload to try again.');
      });
      player.loadSource(src);
      player.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      setNative(true);
      video.src = src;
    } else setError('This browser does not support live HLS playback.');
    return () => {
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      player?.destroy(); playerRef.current = null;
      video.removeAttribute('src'); video.load();
    };
  }, [eventId, src]);

  return <section className="space-y-4" aria-label="Event livestream">
    <video ref={videoRef} controls playsInline aria-label="Live event video"
      onError={() => setError('The stream could not be played. Reload to try again.')}
      className="aspect-video w-full rounded-xl bg-black" />
    {error && <p role="alert">{error}</p>}
    <div className="flex flex-wrap items-center gap-4">
      <label>Video quality <select aria-label="Video quality" value={quality} disabled={native || !levels.length}
        className="rounded border p-2 text-black" onChange={event => {
          const level = Number(event.target.value);
          if (playerRef.current) { switch_bitrate_tier(playerRef.current, level); setQuality(level); }
        }}>
        <option value={-1}>Auto</option>
        {levels.map(level => <option key={level.index} value={level.index}>{level.label}</option>)}
      </select></label>
      {bandwidth > 0 && <span>Estimated bandwidth: {Math.round(bandwidth)} kbps</span>}
      {native && <p>Your browser adjusts quality automatically.</p>}
    </div>
  </section>;
}
