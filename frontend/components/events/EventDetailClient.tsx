"use client";

import Link from "next/link";
import { Event, VipTier, SeatCategoryName } from "@/types/event";
import { formatPrice } from "@/types/event";
import SeatMap from "@/components/venues/SeatMap";
import { useState } from "react";

interface EventDetailClientProps {
  event: Event;
}

const TIER_BADGES: Record<string, string> = {
  bronze: "bg-amber-600/20 text-amber-400 border-amber-600/30",
  silver: "bg-gray-300/20 text-gray-300 border-gray-300/30",
  gold: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  platinum: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

export default function EventDetailClient({ event }: EventDetailClientProps) {
  const [selectedSeatId, setSelectedSeatId] = useState<string | undefined>();
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  const handleSelectSeat = (seat: any) => {
    setSelectedSeatId(seat.id);
  };

  const sections = event.venueSections ?? [];
  const vipTiers = event.vipTiers ?? [];
  const accessibilityInventory = event.accessibilityInventory ?? [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Event Header */}
      <div className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">{event.title}</h1>
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <span>{event.location}</span>
              <span>·</span>
              <span>{new Date(event.startDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
              <span>·</span>
              <span className="text-lg font-bold text-white">
                {event.ticketPrice === 0 ? "Free" : formatPrice(event.ticketPrice, event.currency)}
              </span>
            </div>
          </div>
          <Link
            href={`/events/${event.id}/analytics`}
            className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-200 transition hover:bg-blue-500/20"
          >
            View analytics
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-3">About</h2>
            <p className="text-gray-400 leading-relaxed">{event.description}</p>
          </div>

          {/* Seat Selection */}
          {sections.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">Select Seats</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sections.map((section) => {
                  const mockSeats = Array.from({ length: Math.min(section.rows * section.seatsPerRow, 50) }, (_, i) => {
                    const row = Math.floor(i / section.seatsPerRow) + 1;
                    const num = (i % section.seatsPerRow) + 1;
                    return {
                      id: `mock-${section.id}-${row}-${num}`,
                      sectionId: section.id,
                      seatIdentifier: `${String.fromCharCode(64 + row)}${num}`,
                      row,
                      number: num,
                      status: "available" as const,
                      heldBy: null,
                    };
                  });
                  return (
                    <SeatMap
                      key={section.id}
                      seats={mockSeats}
                      sectionName={`${section.name} (${section.category})`}
                      onSelectSeat={handleSelectSeat}
                      selectedSeatId={selectedSeatId}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* VIP Tiers */}
          {vipTiers.length > 0 && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
              <h3 className="text-md font-semibold text-white mb-4">VIP Tiers</h3>
              <div className="space-y-3">
                {vipTiers.map((tier) => {
                  const badge = TIER_BADGES[tier.name] ?? TIER_BADGES.bronze;
                  const isFull = tier.filledSlots >= tier.maxSlots;
                  const isSelected = selectedTier === tier.id;
                  return (
                    <button
                      key={tier.id}
                      onClick={() => !isFull && setSelectedTier(tier.id)}
                      disabled={isFull}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        isSelected
                          ? "bg-blue-500/10 border-blue-500/40"
                          : isFull
                            ? "bg-white/[0.02] border-white/[0.04] opacity-50 cursor-not-allowed"
                            : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badge}`}>
                          {tier.name}
                        </span>
                        <span className="text-sm font-bold text-white">
                          {formatPrice(tier.price, event.currency)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mb-2">
                        {tier.maxSlots - tier.filledSlots} of {tier.maxSlots} remaining
                      </div>
                      {tier.benefits.length > 0 && (
                        <ul className="space-y-1">
                          {tier.benefits.map((b, i) => (
                            <li key={i} className="text-xs text-gray-400 flex items-center gap-1.5">
                              <svg className="w-3 h-3 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              {b}
                            </li>
                          ))}
                        </ul>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Accessibility */}
          {accessibilityInventory.length > 0 && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
              <h3 className="text-md font-semibold text-white mb-4">Accessibility</h3>
              <div className="space-y-2">
                {accessibilityInventory.map((item) => {
                  const isAvailable = item.bookedSlots < item.totalSlots;
                  return (
                    <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.03]">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isAvailable ? "bg-emerald-500/15" : "bg-gray-500/15"}`}>
                        {item.type === "wheelchair" && (
                          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {item.type === "hearing" && (
                          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 18h.01M3 3l18 18M16 5a4 4 0 00-8 0" />
                          </svg>
                        )}
                        {item.type === "visual" && (
                          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white capitalize">{item.type}</div>
                        <div className="text-xs text-gray-500">
                          {item.bookedSlots}/{item.totalSlots} booked {item.description && `· ${item.description}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
