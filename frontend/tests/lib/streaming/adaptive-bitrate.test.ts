import { afterEach, describe, expect, it, vi } from 'vitest';
import type Hls from 'hls.js';
import { detectViewerBandwidth, reportBufferingEvent, switchBitrateTier } from '@/lib/streaming/adaptive-bitrate';

afterEach(() => vi.unstubAllGlobals());
describe('adaptive bitrate controls', () => {
  it('uses measured bandwidth and handles unavailable estimates', () => {
    expect(detectViewerBandwidth({ bandwidthEstimate: 2_500_000 })).toBe(2500);
    expect(detectViewerBandwidth({ bandwidthEstimate: NaN })).toBe(0);
  });
  it('supports manual quality and returning to automatic selection', () => {
    const player = { levels: [{}, {}], currentLevel: -1 } as Pick<Hls, 'levels' | 'currentLevel'>;
    switchBitrateTier(player, 1); expect(player.currentLevel).toBe(1);
    switchBitrateTier(player, -1); expect(player.currentLevel).toBe(-1);
    expect(() => switchBitrateTier(player, 2)).toThrow(RangeError);
    expect(() => switchBitrateTier(player, NaN)).toThrow(RangeError);
  });
  it('reports stalls without surfacing telemetry outages to playback', async () => {
    const request = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', request);
    await expect(reportBufferingEvent('event', 1200, 2500)).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith('/api/proxy/streaming/events/event/buffering', expect.objectContaining({
      body: JSON.stringify({ durationMs: 1200, bandwidthKbps: 2500 }),
    }));
  });
});
