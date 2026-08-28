"use client";

import { useEffect, useMemo, useState } from "react";
import { Seat } from "@/types/event";
import { getAccessToken } from "@/lib/auth/auth";

interface SeatMapProps {
  seats: Seat[];
  sectionName: string;
  onSelectSeat: (seat: Seat) => void;
  selectedSeatId?: string;
  refreshIntervalMs?: number;
  eventId?: string;
}

const SEAT_SIZE = 32;
const SEAT_GAP = 10;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function SeatMap(props: SeatMapProps) {
  const [liveSeats, setLiveSeats] = useState(props.seats);

  useEffect(() => setLiveSeats(props.seats), [props.seats]);

  useEffect(() => {
    const sectionId = props.seats[0]?.sectionId;
    if (!sectionId || !props.eventId) return;
    const refresh = async () => {
      const token = getAccessToken();
      const response = await fetch(`${API_URL}/events/${props.eventId}/venues/sections/${sectionId}/seats`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (response.ok) setLiveSeats(await response.json());
    };
    const timer = window.setInterval(refresh, props.refreshIntervalMs ?? 5000);
    return () => window.clearInterval(timer);
  }, [props.eventId, props.refreshIntervalMs, props.seats]);

  return render_seat_map({ ...props, seats: liveSeats });
}

export function render_seat_map({ seats, sectionName, onSelectSeat, selectedSeatId }: SeatMapProps) {
  return <SeatMapCanvas seats={seats} sectionName={sectionName} onSelectSeat={onSelectSeat} selectedSeatId={selectedSeatId} />;
}

function SeatMapCanvas({ seats, sectionName, onSelectSeat, selectedSeatId }: SeatMapProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const rows = [...new Set(seats.map((seat) => seat.row))].sort((a, b) => a - b);
  const maxNumber = Math.max(...seats.map((seat) => seat.number), 1);
  const width = Math.max(360, maxNumber * (SEAT_SIZE + SEAT_GAP) + 90);
  const height = Math.max(260, rows.length * (SEAT_SIZE + SEAT_GAP) + 110);
  const availableCount = useMemo(() => seats.filter((seat) => seat.status === "available").length, [seats]);

  return (
    <section className="rounded-xl border border-gray-700 bg-gray-900 p-4" aria-label={`${sectionName} seat map`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-300">{sectionName}</h4>
          <p className="text-xs text-gray-500">{availableCount} seats available · updates live</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span onClick={() => setZoom((value) => Math.min(2.5, value + 0.2))} className="cursor-pointer rounded border border-gray-700 px-2 py-1 hover:bg-gray-800" aria-label="Zoom in">+</span>
          <span>{Math.round(zoom * 100)}%</span>
          <span onClick={() => setZoom((value) => Math.max(0.6, value - 0.2))} className="cursor-pointer rounded border border-gray-700 px-2 py-1 hover:bg-gray-800" aria-label="Zoom out">-</span>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-800 bg-gray-950" onWheel={(event) => { event.preventDefault(); setZoom((value) => Math.min(2.5, Math.max(0.6, value + (event.deltaY < 0 ? 0.1 : -0.1)))); }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[360px] w-full cursor-grab active:cursor-grabbing" role="img" aria-label={`${sectionName} interactive seat map`} onPointerDown={(event) => setDragStart({ x: event.clientX - offset.x, y: event.clientY - offset.y })} onPointerMove={(event) => { if (dragStart) setOffset({ x: event.clientX - dragStart.x, y: event.clientY - dragStart.y }); }} onPointerUp={() => setDragStart(null)} onPointerLeave={() => setDragStart(null)}>
          <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>
            <rect x="45" y="14" width={width - 90} height="22" rx="11" fill="#334155" />
            <text x={width / 2} y="29" textAnchor="middle" fill="#cbd5e1" fontSize="10">STAGE</text>
            {seats.map((seat) => {
              const x = 55 + (seat.number - 1) * (SEAT_SIZE + SEAT_GAP);
              const y = 58 + (seat.row - 1) * (SEAT_SIZE + SEAT_GAP);
              const selected = seat.id === selectedSeatId;
              const available = seat.status === "available";
              const fill = selected ? "#2563eb" : available ? "#166534" : seat.status === "held" ? "#854d0e" : "#7f1d1d";
              return <g key={seat.id} role="button" tabIndex={available ? 0 : -1} aria-label={`${seat.seatIdentifier} - ${seat.status}`} onClick={() => available && onSelectSeat(seat)} onKeyDown={(event) => { if (available && (event.key === "Enter" || event.key === " ")) onSelectSeat(seat); }}>
                <rect x={x} y={y} width={SEAT_SIZE} height={SEAT_SIZE} rx="7" fill={fill} stroke={selected ? "#bfdbfe" : "#475569"} strokeWidth={selected ? 3 : 1} />
                <text x={x + SEAT_SIZE / 2} y={y + 20} textAnchor="middle" fill="white" fontSize="10">{seat.number}</text>
                <title>{`${seat.seatIdentifier} · ${seat.status} · ${seat.pricingTier ?? "General"} · ${(seat.price ?? 0).toLocaleString()} XLM${seat.obstructedView ? " · Obstructed view" : ""}`}</title>
              </g>;
            })}
          </g>
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-400">
        <Legend color="bg-green-700" label="Available" />
        <Legend color="bg-blue-600" label="Selected" />
        <Legend color="bg-yellow-700" label="Held" />
        <Legend color="bg-red-800" label="Booked" />
        <span className="text-amber-400">Warning icon in seat title indicates obstructed view</span>
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-sm ${color}`} />{label}</span>;
}

import { useState } from "react";
import { Seat } from "@/types/event";

interface SeatMapProps {
  seats: Seat[];
  sectionName: string;
  onSelectSeat: (seat: Seat) => void;
  selectedSeatId?: string;
}

const SEAT_SIZE = 36;
const SEAT_GAP = 6;

export default function SeatMap({ seats, sectionName, onSelectSeat, selectedSeatId }: SeatMapProps) {
  const rows = [...new Set(seats.map(s => s.row))].sort((a, b) => a - b);
  const seatsPerRow = [...new Set(seats.map(s => s.number))].length;

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6">
      <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        {sectionName}
      </h4>
      <div className="flex flex-col items-center gap-1">
        {/* Stage */}
        <div className="w-3/4 h-3 rounded-full bg-gradient-to-r from-purple-500/40 via-purple-400/30 to-purple-500/40 mb-6" />
        <div className="text-[10px] text-gray-600 mb-4 -mt-2">STAGE</div>

        {/* Seats */}
        <div className="flex flex-col gap-1.5">
          {rows.map((rowNum) => {
            const rowSeats = seats.filter(s => s.row === rowNum).sort((a, b) => a.number - b.number);
            return (
              <div key={rowNum} className="flex items-center gap-1.5">
                <span className="w-5 text-[10px] text-gray-600 text-right">
                  {String.fromCharCode(64 + rowNum)}
                </span>
                <div className="flex gap-1.5">
                  {rowSeats.map((seat) => {
                    const isSelected = seat.id === selectedSeatId;
                    const isAvailable = seat.status === "available";
                    const isHeld = seat.status === "held";
                    const isBooked = seat.status === "booked";

                    return (
                      <button
                        key={seat.id}
                        disabled={!isAvailable}
                        onClick={() => isAvailable && onSelectSeat(seat)}
                        className={`
                          w-[${SEAT_SIZE}px] h-[${SEAT_SIZE}px] rounded-t-lg text-[9px] font-bold
                          transition-all duration-200 flex items-center justify-center
                          ${isSelected
                            ? "bg-blue-500 text-white scale-110 shadow-lg shadow-blue-500/30"
                            : isBooked
                              ? "bg-red-500/30 text-red-300 cursor-not-allowed"
                              : isHeld
                                ? "bg-yellow-500/30 text-yellow-300 cursor-not-allowed"
                                : "bg-white/[0.08] text-gray-400 hover:bg-blue-500/40 hover:text-blue-300 hover:scale-105 cursor-pointer"
                          }
                        `}
                        title={`${seat.seatIdentifier} - ${seat.status}`}
                      >
                        {seat.number}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
