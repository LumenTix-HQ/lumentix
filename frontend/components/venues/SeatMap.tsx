"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Seat } from "@/types/event";
import { announceCartUpdate, injectAriaLabels } from "@/lib/a11y";
import { getAccessToken } from "@/lib/auth/auth";

interface SeatMapProps {
  seats: Seat[];
  sectionName: string;
  onSelectSeat: (seat: Seat) => void;
  selectedSeatId?: string;
  refreshIntervalMs?: number;
  eventId?: string;
}

const SEAT_SIZE = 36;
const SEAT_GAP = 6;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function SeatMap(props: SeatMapProps) {
  const [liveSeats, setLiveSeats] = useState(props.seats);

  useEffect(() => setLiveSeats(props.seats), [props.seats]);

  // When an eventId is supplied, keep this section's seats fresh by polling
  // the backend, so a seat someone else holds/books shows up here shortly
  // after without a manual refresh.
  useEffect(() => {
    const sectionId = props.seats[0]?.sectionId;
    if (!sectionId || !props.eventId) return;
    const refresh = async () => {
      const token = getAccessToken();
      const response = await fetch(
        `${API_URL}/events/${props.eventId}/venues/sections/${sectionId}/seats`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        },
      );
      if (response.ok) setLiveSeats(await response.json());
    };
    const timer = window.setInterval(refresh, props.refreshIntervalMs ?? 5000);
    return () => window.clearInterval(timer);
  }, [props.eventId, props.refreshIntervalMs, props.seats]);

  return renderSeatMap({ ...props, seats: liveSeats });
}

/** Renders the interactive (zoomable/pannable) seat map canvas. */
export function renderSeatMap(props: SeatMapProps) {
  return <SeatMapCanvas {...props} />;
}

function SeatMapCanvas({
  seats,
  sectionName,
  onSelectSeat,
  selectedSeatId,
  eventId,
}: SeatMapProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  // Tracks the last seat requested for a temporary backend hold, so the
  // previous hold can be released when the buyer moves to another seat.
  const heldSeatIdRef = useRef<string | null>(null);
  // Roving tabindex: the seat map is a single tab stop and arrow keys move
  // between seats, instead of every seat being its own tab stop.
  const [focusedSeatId, setFocusedSeatId] = useState<string | null>(null);
  const seatRefs = useRef(new Map<string, SVGGElement>());
  const instructionsId = useId();

  const rows = useMemo(
    () => [...new Set(seats.map((seat) => seat.row))].sort((a, b) => a - b),
    [seats],
  );
  const maxNumber = useMemo(() => Math.max(...seats.map((seat) => seat.number), 1), [seats]);
  const width = Math.max(360, maxNumber * (SEAT_SIZE + SEAT_GAP) + 90);
  const height = Math.max(260, rows.length * (SEAT_SIZE + SEAT_GAP) + 110);
  const availableCount = useMemo(
    () => seats.filter((seat) => seat.status === "available").length,
    [seats],
  );
  const seatsByRow = useMemo(() => {
    const byRow = new Map<number, Seat[]>();
    for (const seat of seats) {
      byRow.set(seat.row, [...(byRow.get(seat.row) ?? []), seat]);
    }
    byRow.forEach((rowSeats) => rowSeats.sort((a, b) => a.number - b.number));
    return byRow;
  }, [seats]);

  const tabStopId =
    (focusedSeatId && seats.some((seat) => seat.id === focusedSeatId) && focusedSeatId) ||
    (selectedSeatId && seats.some((seat) => seat.id === selectedSeatId) && selectedSeatId) ||
    seats.find((seat) => seat.status === "available")?.id ||
    seats[0]?.id;

  function focusSeat(seat: Seat | undefined): void {
    if (!seat) return;
    setFocusedSeatId(seat.id);
    seatRefs.current.get(seat.id)?.focus();
  }

  /** Arrow keys move along a row / to the nearest seat in the adjacent row. */
  function seatInDirection(seat: Seat, key: string): Seat | undefined {
    const rowSeats = seatsByRow.get(seat.row) ?? [];
    const index = rowSeats.findIndex((candidate) => candidate.id === seat.id);
    switch (key) {
      case "ArrowRight":
        return rowSeats[index + 1];
      case "ArrowLeft":
        return rowSeats[index - 1];
      case "Home":
        return rowSeats[0];
      case "End":
        return rowSeats[rowSeats.length - 1];
      case "ArrowUp":
      case "ArrowDown": {
        const rowIndex = rows.indexOf(seat.row) + (key === "ArrowDown" ? 1 : -1);
        const targetRow = seatsByRow.get(rows[rowIndex]) ?? [];
        return targetRow.reduce<Seat | undefined>(
          (closest, candidate) =>
            !closest ||
            Math.abs(candidate.number - seat.number) < Math.abs(closest.number - seat.number)
              ? candidate
              : closest,
          undefined,
        );
      }
      default:
        return undefined;
    }
  }

  useEffect(
    () => () => {
      const heldId = heldSeatIdRef.current;
      if (heldId && eventId) void releaseHeldSeat(heldId, eventId);
    },
    [eventId],
  );

  async function reserveSeat(seatId: string, targetEventId: string): Promise<void> {
    const token = getAccessToken();
    try {
      await fetch(`${API_URL}/events/${targetEventId}/venues/seats/${seatId}/reserve`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // Best-effort hold; selection still proceeds for cart building.
    }
  }

  async function releaseHeldSeat(seatId: string, targetEventId: string): Promise<void> {
    const token = getAccessToken();
    try {
      await fetch(`${API_URL}/events/${targetEventId}/venues/seats/${seatId}/release`, {
        method: "PUT",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // Best-effort release; expired holds are auto-released by the backend.
    }
  }

  function handleSelect(seat: Seat): void {
    if (seat.status !== "available") return;
    const previousHeld = heldSeatIdRef.current;
    if (previousHeld && previousHeld !== seat.id && eventId) {
      void releaseHeldSeat(previousHeld, eventId);
    }
    heldSeatIdRef.current = seat.id;
    if (eventId) void reserveSeat(seat.id, eventId);
    setFocusedSeatId(seat.id);
    onSelectSeat(seat);
    announceCartUpdate(injectAriaLabels.seat(seat, true));
  }

  return (
    <section
      className="rounded-xl border border-gray-700 bg-gray-900 p-4"
      aria-label={`${sectionName} seat map`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-300">
            {sectionName}
          </h4>
          <p className="text-xs text-gray-500">{availableCount} seats available · updates live</p>
          <p id={instructionsId} className="sr-only">
            Use the arrow keys to move between seats, Home and End to jump to the ends of a row,
            and Enter or Space to select a seat.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500" role="group" aria-label="Zoom">
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(2.5, value + 0.2))}
            className="rounded border border-gray-700 px-2 py-1 hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            aria-label="Zoom in"
          >
            +
          </button>
          <span aria-live="polite" aria-atomic="true">
            <span className="sr-only">Zoom </span>
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(0.6, value - 0.2))}
            className="rounded border border-gray-700 px-2 py-1 hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            aria-label="Zoom out"
          >
            -
          </button>
        </div>
      </div>
      <div
        className="overflow-hidden rounded-lg border border-gray-800 bg-gray-950"
        onWheel={(event) => {
          event.preventDefault();
          setZoom((value) =>
            Math.min(2.5, Math.max(0.6, value + (event.deltaY < 0 ? 0.1 : -0.1))),
          );
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[360px] w-full cursor-grab active:cursor-grabbing"
          // A group, not role="img": the children of an image are presentational,
          // which would hide every seat button from screen readers.
          role="group"
          aria-label={`${sectionName} interactive seat map`}
          aria-describedby={instructionsId}
          onPointerDown={(event) =>
            setDragStart({ x: event.clientX - offset.x, y: event.clientY - offset.y })
          }
          onPointerMove={(event) => {
            if (dragStart) setOffset({ x: event.clientX - dragStart.x, y: event.clientY - dragStart.y });
          }}
          onPointerUp={() => setDragStart(null)}
          onPointerLeave={() => setDragStart(null)}
        >
          <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>
            <rect x="45" y="14" width={width - 90} height="22" rx="11" fill="#334155" aria-hidden="true" />
            <text x={width / 2} y="29" textAnchor="middle" fill="#cbd5e1" fontSize="10" aria-hidden="true">
              STAGE
            </text>
            {seats.map((seat) => {
              const x = 55 + (seat.number - 1) * (SEAT_SIZE + SEAT_GAP);
              const y = 58 + (seat.row - 1) * (SEAT_SIZE + SEAT_GAP);
              const selected = seat.id === selectedSeatId;
              const available = seat.status === "available";
              const fill = selected
                ? "#2563eb"
                : available
                  ? "#166534"
                  : seat.status === "held"
                    ? "#854d0e"
                    : "#7f1d1d";
              return (
                <g
                  key={seat.id}
                  ref={(node) => {
                    if (node) seatRefs.current.set(seat.id, node);
                    else seatRefs.current.delete(seat.id);
                  }}
                  role="button"
                  tabIndex={seat.id === tabStopId ? 0 : -1}
                  aria-label={injectAriaLabels.seat(seat, selected)}
                  aria-pressed={selected}
                  aria-disabled={!available}
                  title={`${seat.seatIdentifier} - ${seat.status}`}
                  className="focus:outline-none [&:focus-visible>rect]:stroke-blue-300 [&:focus-visible>rect]:[stroke-width:3]"
                  onClick={() => handleSelect(seat)}
                  onFocus={() => setFocusedSeatId(seat.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      if (available) handleSelect(seat);
                      return;
                    }
                    const target = seatInDirection(seat, event.key);
                    if (target) {
                      event.preventDefault();
                      focusSeat(target);
                    }
                  }}
                >
                  <rect
                    x={x}
                    y={y}
                    width={SEAT_SIZE}
                    height={SEAT_SIZE}
                    rx="7"
                    fill={fill}
                    stroke={selected ? "#bfdbfe" : "#475569"}
                    strokeWidth={selected ? 3 : 1}
                  />
                  <text x={x + SEAT_SIZE / 2} y={y + 20} textAnchor="middle" fill="white" fontSize="10" aria-hidden="true">
                    {seat.number}
                  </text>
                  {seat.obstructedView && (
                    <text x={x + SEAT_SIZE - 10} y={y + 11} fill="#fbbf24" fontWeight="bold" fontSize="9" aria-hidden="true">
                      !
                    </text>
                  )}
                  {typeof seat.price === "number" && (
                    <text
                      x={x + SEAT_SIZE / 2}
                      y={y + SEAT_SIZE + 11}
                      textAnchor="middle"
                      fill="#64748b"
                      fontSize="7"
                      aria-hidden="true"
                    >
                      {seat.price.toLocaleString()} XLM
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-400" aria-hidden="true">
        <Legend color="bg-green-700" label="Available" />
        <Legend color="bg-blue-600" label="Selected" />
        <Legend color="bg-yellow-700" label="Held" />
        <Legend color="bg-red-800" label="Booked" />
        <span className="text-amber-400">! marks an obstructed view · price shown under each seat</span>
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}