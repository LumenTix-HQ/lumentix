import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  aggregateScanPositions,
  generateHeatmapTiles,
  streamHeatmapUpdates,
  type ScanPosition,
  type HeatmapTile,
} from '@/lib/heatmap';

function position(x: number, y: number): ScanPosition {
  return { x, y, timestamp: Date.now() };
}

describe('heatmap lib', () => {
  it('exports camelCase function names (issue #1171)', () => {
    // Guards against the snake_case regression the issue describes.
    expect(typeof aggregateScanPositions).toBe('function');
    expect(typeof generateHeatmapTiles).toBe('function');
    expect(typeof streamHeatmapUpdates).toBe('function');
  });

  it('aggregates scan positions into per-zone buckets', () => {
    const aggregated = aggregateScanPositions([
      { x: 10, y: 20, timestamp: 1, zoneId: 'a' },
      { x: 15, y: 25, timestamp: 2, zoneId: 'a' },
      { x: 200, y: 210, timestamp: 3 },
    ]);
    expect(aggregated).toContainEqual({ key: 'a', x: 10, y: 20, count: 2 });
    expect(aggregated).toHaveLength(2);
  });

  it('generates normalised density tiles relative to the max bucket', () => {
    const aggregated = aggregateScanPositions([
      { x: 5, y: 5, timestamp: 1, zoneId: 'busy' },
      { x: 6, y: 6, timestamp: 2, zoneId: 'busy' },
      { x: 7, y: 7, timestamp: 3, zoneId: 'busy' },
      { x: 105, y: 5, timestamp: 4, zoneId: 'quiet' },
    ]);
    const tiles = generateHeatmapTiles(aggregated, 50);
    expect(tiles).toHaveLength(2);
    const busy = tiles.find((t) => t.x === 5);
    const quiet = tiles.find((t) => t.x === 105);
    expect(busy?.density).toBe(1);
    expect(quiet?.density).toBeCloseTo(1 / 3);
  });

  it('streams updates and stops on cleanup', async () => {
    vi.useFakeTimers();
    const onUpdate = vi.fn();
    const fetchPositions = vi
      .fn()
      .mockResolvedValueOnce([{ x: 1, y: 1, timestamp: 1 }])
      .mockResolvedValue([{ x: 2, y: 2, timestamp: 2 }]);

    const stop = streamHeatmapUpdates(fetchPositions, onUpdate, 100);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(onUpdate).toHaveBeenCalled();
    const firstCalls = onUpdate.mock.calls.length;

    stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onUpdate.mock.calls.length).toBe(firstCalls);

    vi.useRealTimers();
  });
});

describe('streamHeatmapUpdates tileSize and backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Analytics-style regression test for the tileSize plumbing bug (#1147):
  // streaming mode must compute tiles on the caller's tileSize, not the
  // hard-coded default of 50.
  it('uses the provided tileSize instead of the hard-coded default', async () => {
    const fetchPositions = vi.fn().mockResolvedValue([position(120, 120)]);
    const onUpdate = vi.fn<(tiles: HeatmapTile[]) => void>();

    const stop = streamHeatmapUpdates(fetchPositions, onUpdate, 5000, { tileSize: 40 });
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));

    const [tiles] = onUpdate.mock.calls[0];
    expect(tiles[0].tileX).toBe(3); // 120 / 40
    expect(tiles[0].tileY).toBe(3);

    stop();
  });

  it('falls back to a tileSize of 50 when none is provided', async () => {
    const fetchPositions = vi.fn().mockResolvedValue([position(120, 120)]);
    const onUpdate = vi.fn<(tiles: HeatmapTile[]) => void>();

    const stop = streamHeatmapUpdates(fetchPositions, onUpdate);
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));

    const [tiles] = onUpdate.mock.calls[0];
    expect(tiles[0].tileX).toBe(2); // 120 / 50

    stop();
  });

  // Regression tests for #1148: failures must be surfaced via onError and
  // retried with growing (capped) backoff, not a fixed-interval loop.
  it('surfaces fetch failures via onError with an increasing failure count', async () => {
    const fetchPositions = vi.fn().mockRejectedValue(new Error('network down'));
    const onUpdate = vi.fn();
    const onError = vi.fn();

    const stop = streamHeatmapUpdates(fetchPositions, onUpdate, 1000, { onError });

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenLastCalledWith(expect.any(Error), 1);

    await vi.advanceTimersByTimeAsync(2000); // backoff after 1st failure: 1000 * 2^1
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenLastCalledWith(expect.any(Error), 2);

    expect(onUpdate).not.toHaveBeenCalled();
    stop();
  });

  it('caps the backoff delay at maxBackoffMs', async () => {
    const fetchPositions = vi.fn().mockRejectedValue(new Error('network down'));
    const onError = vi.fn();

    const stop = streamHeatmapUpdates(fetchPositions, vi.fn(), 1000, {
      onError,
      maxBackoffMs: 3000,
    });

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1)); // fails immediately

    // Without a cap, failure #4 would wait 1000 * 2^4 = 16000ms.
    // With maxBackoffMs=3000, every subsequent retry should be capped at 3000ms.
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);

    expect(onError).toHaveBeenCalledTimes(4);
    stop();
  });

  it('resets the failure count and resumes normal updates after a success', async () => {
    const fetchPositions = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue([position(10, 10)]);
    const onUpdate = vi.fn();
    const onError = vi.fn();

    const stop = streamHeatmapUpdates(fetchPositions, onUpdate, 1000, { onError });

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(2000); // backoff for failure #1
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));

    stop();
  });

  it('stops polling once the returned cleanup function is called', async () => {
    const fetchPositions = vi.fn().mockResolvedValue([position(10, 10)]);
    const onUpdate = vi.fn();

    const stop = streamHeatmapUpdates(fetchPositions, onUpdate, 1000);
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));

    stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchPositions).toHaveBeenCalledTimes(1);
  });
});
