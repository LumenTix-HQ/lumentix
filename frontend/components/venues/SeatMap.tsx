"use client";

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
