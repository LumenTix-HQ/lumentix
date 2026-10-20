'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScanPosition,
  HeatmapTile,
  aggregateScanPositions,
  generateHeatmapTiles,
  streamHeatmapUpdates,
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

function densityLabel(tile: HeatmapTile): string {
  return `${Math.round(tile.density * 100)} percent`;
}

/**
 * Visually-hidden table exposing each tile's density to assistive tech
 * (issue #1172). Kept in sync with the `tiles` state driving the canvas so a
 * screen-reader user can inspect the same crowd-concentration data.
 */
function DensityDataTable({ tiles }: { tiles: HeatmapTile[] }) {
  if (tiles.length === 0) return null;
  return (
    <table className="sr-only">
      <caption>Attendee density by zone</caption>
      <thead>
        <tr>
          <th scope="col">Zone (column, row)</th>
          <th scope="col">Attendees</th>
          <th scope="col">Density</th>
        </tr>
      </thead>
      <tbody>
        {tiles.map((tile) => (
          <tr key={`${tile.tileX}-${tile.tileY}`}>
            <td>{tile.tileX + 1}, {tile.tileY + 1}</td>
            <td>{tile.count}</td>
            <td>{densityLabel(tile)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
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
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  // Highest-density zone for quick non-visual scanning near the legend.
  const hottest = useMemo(() => {
    if (tiles.length === 0) return null;
    return tiles.reduce((a, b) => (b.density > a.density ? b : a));
  }, [tiles]);

  // Announce significant changes via a polite live region.
  useEffect(() => {
    if (tiles.length === 0) return;
    setAnnouncement(
      `Heatmap updated. ${hottest ? `Highest density zone is column ${hottest.tileX + 1}, row ${hottest.tileY + 1} at ${densityLabel(hottest)}.` : ''}`,
    );
  }, [tiles, hottest]);

  // Announce connection loss too, since the visual banner alone wouldn't
  // reach a screen-reader user.
  useEffect(() => {
    if (consecutiveFailures > 0) {
      setAnnouncement('Heatmap connection lost — retrying.');
    }
  }, [consecutiveFailures]);

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
    const stop = streamHeatmapUpdates(
      fetchPositions,
      (freshTiles) => {
        setTiles(freshTiles);
        setLastUpdated(new Date());
        setConsecutiveFailures(0);
      },
      intervalMs,
      {
        tileSize,
        onError: (_err, failures) => setConsecutiveFailures(failures),
      },
    );
    return stop;
  }, [fetchPositions, intervalMs, tileSize]);

  // Static mode: compute tiles once from the provided positions array.
  useEffect(() => {
    if (!positions || fetchPositions) return;
    const aggregated = aggregateScanPositions(positions);
    const freshTiles = generateHeatmapTiles(aggregated, tileSize);
    setTiles(freshTiles);
    setLastUpdated(new Date());
  }, [positions, tileSize, fetchPositions]);

  return (
    <div className="relative inline-block">
      <figure>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          aria-label="Attendee density heatmap — see the density table below for per-zone values"
          role="img"
          className="rounded-lg border border-gray-200 bg-gray-50"
        />
        <figcaption className="sr-only">
          Heatmap of attendee density across the venue. Detailed per-zone
          densities are listed in the adjacent table.
        </figcaption>
      </figure>

      {/* Live region announcing refresh / density changes / connection loss
          (mirrors announceCartUpdate semantics without a document-level
          region). */}
      <p className="sr-only" aria-live="polite" aria-atomic="true" role="status">
        {announcement}
      </p>

      {hottest && (
        <p className="mt-1 text-xs text-gray-500">
          Highest density: zone ({hottest.tileX + 1}, {hottest.tileY + 1}) at{' '}
          {densityLabel(hottest)} ({hottest.count} attendees)
        </p>
      )}

      {consecutiveFailures > 0 ? (
        <p className="mt-1 text-right text-xs text-red-500" role="status">
          Connection lost — retrying… ({consecutiveFailures} failed attempt
          {consecutiveFailures > 1 ? 's' : ''})
          {lastUpdated && ` · last updated ${lastUpdated.toLocaleTimeString()}`}
        </p>
      ) : (
        lastUpdated && (
          <p className="mt-1 text-right text-xs text-gray-400">
            Updated {lastUpdated.toLocaleTimeString()}
          </p>
        )
      )}

      {/* Legend */}
      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
        <span>Low</span>
        <div
          role="img"
          aria-label="Color legend from low density to high density"
          className="h-3 flex-1 rounded"
          style={{
            background:
              'linear-gradient(to right, rgba(0,0,255,0.3), rgba(0,200,0,0.5), rgba(255,0,0,0.8))',
          }}
        />
        <span>High</span>
      </div>

      {/* Screen-reader density data */}
      <DensityDataTable tiles={tiles} />
    </div>
  );
}