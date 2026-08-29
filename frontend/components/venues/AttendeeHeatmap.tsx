'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ScanPosition,
  HeatmapTile,
  aggregate_scan_positions,
  generate_heatmap_tiles,
  stream_heatmap_updates,
} from '@/lib/heatmap';

interface AttendeeHeatmapProps {
  /** Called on each polling interval to supply fresh scan positions. */
  fetchPositions?: () => Promise<ScanPosition[]> | ScanPosition[];
  /** Static positions for non-streaming mode. */
  positions?: ScanPosition[];
  /** Canvas width in px (default 800). */
  width?: number;
  /** Canvas height in px (default 600). */
  height?: number;
  /** Polling interval in ms when using `fetchPositions` (default 5000). */
  intervalMs?: number;
  /** Grid tile size in px (default 50). */
  tileSize?: number;
}

/** RGBA colour for a given density value (0–1) using a blue→green→red gradient. */
function densityToColour(density: number): string {
  const r = Math.round(density * 255);
  const g = Math.round((1 - Math.abs(density - 0.5) * 2) * 200);
  const b = Math.round((1 - density) * 255);
  const alpha = 0.3 + density * 0.5;
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function AttendeeHeatmap({
  fetchPositions,
  positions,
  width = 800,
  height = 600,
  intervalMs = 5_000,
  tileSize = 50,
}: AttendeeHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tiles, setTiles] = useState<HeatmapTile[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Render tiles onto the canvas whenever they change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    for (const tile of tiles) {
      ctx.fillStyle = densityToColour(tile.density);
      ctx.fillRect(
        tile.tileX * tileSize,
        tile.tileY * tileSize,
        tileSize,
        tileSize,
      );
    }
  }, [tiles, width, height, tileSize]);

  // Streaming mode: subscribe to live updates.
  useEffect(() => {
    if (!fetchPositions) return;
    const stop = stream_heatmap_updates(
      fetchPositions,
      (freshTiles) => {
        setTiles(freshTiles);
        setLastUpdated(new Date());
      },
      intervalMs,
    );
    return stop;
  }, [fetchPositions, intervalMs]);

  // Static mode: compute tiles once from the provided positions array.
  useEffect(() => {
    if (!positions || fetchPositions) return;
    const aggregated = aggregate_scan_positions(positions);
    const freshTiles = generate_heatmap_tiles(aggregated, tileSize);
    setTiles(freshTiles);
    setLastUpdated(new Date());
  }, [positions, tileSize, fetchPositions]);

  return (
    <div className="relative inline-block">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        aria-label="Attendee density heatmap"
        role="img"
        className="rounded-lg border border-gray-200 bg-gray-50"
      />
      {lastUpdated && (
        <p className="mt-1 text-right text-xs text-gray-400">
          Updated {lastUpdated.toLocaleTimeString()}
        </p>
      )}
      {/* Legend */}
      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
        <span>Low</span>
        <div
          className="h-3 flex-1 rounded"
          style={{
            background:
              'linear-gradient(to right, rgba(0,0,255,0.3), rgba(0,200,0,0.5), rgba(255,0,0,0.8))',
          }}
        />
        <span>High</span>
      </div>
    </div>
  );
}
