import type Hls from 'hls.js';

/** HLS measures actual segment throughput; no synthetic speed-test traffic. */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Public function name specified by the issue.
export function detectViewerBandwidth(player: Pick<Hls, 'bandwidthEstimate'>): number {
  return Number.isFinite(player.bandwidthEstimate) ? Math.max(0, player.bandwidthEstimate / 1000) : 0;
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- Public function name specified by the issue.
export function switchBitrateTier(player: Pick<Hls, 'levels' | 'currentLevel'>, level: number) {
  if (!Number.isInteger(level) || level < -1 || level >= player.levels.length) {
    throw new RangeError('Unknown stream quality');
  }
  // -1 hands selection back to HLS's throughput/buffer-aware ABR algorithm.
  player.currentLevel = level;
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- Public function name specified by the issue.
export async function reportBufferingEvent(eventId: string, durationMs: number, bandwidthKbps: number) {
  try {
    await fetch(`/api/proxy/streaming/events/${encodeURIComponent(eventId)}/buffering`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durationMs: Math.min(3_600_000, Math.max(0, durationMs)), bandwidthKbps }),
      keepalive: true,
    });
  } catch { /* Telemetry must never interrupt playback. */ }
}
