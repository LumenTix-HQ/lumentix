// lib/heatmap.ts
// Attendee heatmap utilities for venue layout crowd density visualization.

export interface ScanPosition {
  x: number;
  y: number;
  timestamp: number;
  zoneId?: string;
}

export interface HeatmapTile {
  x: number;
  y: number;
  tileX: number;
  tileY: number;
  density: number; // 0–1 normalised
  count: number;
}

export interface HeatmapUpdateCallback {
  (tiles: HeatmapTile[]): void;
}

/**
 * Aggregate raw scan positions into per-zone counts.
 * Groups positions by their zoneId (or a grid-quantised key when zoneId is
 * absent) and returns a flat array ready for tile generation.
 */
export function aggregate_scan_positions(
  positions: ScanPosition[],
  gridSize = 50,
): Array<{ key: string; x: number; y: number; count: number }> {
  const buckets = new Map<string, { x: number; y: number; count: number }>();

  for (const pos of positions) {
    const key =
      pos.zoneId ??
      `${Math.floor(pos.x / gridSize)}_${Math.floor(pos.y / gridSize)}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      buckets.set(key, { x: pos.x, y: pos.y, count: 1 });
    }
  }

  return Array.from(buckets.entries()).map(([key, value]) => ({
    key,
    ...value,
  }));
}

/**
 * Convert aggregated position buckets into normalised heatmap tiles.
 * Each tile carries a `density` value between 0 and 1 relative to the
 * maximum bucket count in the current dataset.
 */
export function generate_heatmap_tiles(
  aggregated: ReturnType<typeof aggregate_scan_positions>,
  tileSize = 50,
): HeatmapTile[] {
  if (aggregated.length === 0) return [];

  const maxCount = Math.max(...aggregated.map((b) => b.count));

  return aggregated.map((bucket) => ({
    x: bucket.x,
    y: bucket.y,
    tileX: Math.floor(bucket.x / tileSize),
    tileY: Math.floor(bucket.y / tileSize),
    density: maxCount > 0 ? bucket.count / maxCount : 0,
    count: bucket.count,
  }));
}

/**
 * Subscribe to simulated real-time heatmap updates.
 * In a production deployment this would open a WebSocket or SSE connection;
 * here it polls a provided `fetchPositions` function on the given interval
 * and fires `onUpdate` with fresh tiles each cycle.
 *
 * Returns a cleanup function that stops polling.
 */
export function stream_heatmap_updates(
  fetchPositions: () => Promise<ScanPosition[]> | ScanPosition[],
  onUpdate: HeatmapUpdateCallback,
  intervalMs = 5000,
): () => void {
  let active = true;

  const tick = async () => {
    if (!active) return;
    try {
      const positions = await fetchPositions();
      const aggregated = aggregate_scan_positions(positions);
      const tiles = generate_heatmap_tiles(aggregated);
      onUpdate(tiles);
    } catch (err) {
      console.error('[heatmap] stream error:', err);
    }
    if (active) {
      setTimeout(tick, intervalMs);
    }
  };

  void tick();

  return () => {
    active = false;
  };
}
