"use client";

import Link from "next/link";
import {Event, EventCategory} from "@/types/event";

const CATEGORY_STYLES: Record<
	EventCategory,
	{gradient: string; badge: string}
> = {
	[EventCategory.CONFERENCE]: {
		gradient: "from-blue-500/20 to-indigo-500/20",
		badge: "bg-blue-500/20 text-blue-400 border-blue-500/30",
	},
	[EventCategory.WORKSHOP]: {
		gradient: "from-purple-500/20 to-pink-500/20",
		badge: "bg-purple-500/20 text-purple-400 border-purple-500/30",
	},
	[EventCategory.MEETUP]: {
		gradient: "from-teal-500/20 to-emerald-500/20",
		badge: "bg-teal-500/20 text-teal-400 border-teal-500/30",
	},
	[EventCategory.CONCERT]: {
		gradient: "from-pink-500/20 to-rose-500/20",
		badge: "bg-pink-500/20 text-pink-400 border-pink-500/30",
	},
	[EventCategory.SPORTS]: {
		gradient: "from-orange-500/20 to-amber-500/20",
		badge: "bg-orange-500/20 text-orange-400 border-orange-500/30",
	},
	[EventCategory.FESTIVAL]: {
		gradient: "from-yellow-500/20 to-orange-500/20",
		badge: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
	},
	[EventCategory.OTHER]: {
		gradient: "from-gray-500/20 to-slate-500/20",
		badge: "bg-gray-500/20 text-gray-400 border-gray-500/30",
	},
};

function formatDate(dateStr: string): string {
	return new Date(dateStr).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatTime(dateStr: string): string {
	return new Date(dateStr).toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
}

interface EventCardProps {
	event: Event;
	viewMode: "grid" | "list";
}

export default function EventCard({event, viewMode}: EventCardProps) {
	const style = CATEGORY_STYLES[event.category];
	const soldPercentage = Math.round(
		(event.soldTickets / event.totalTickets) * 100,
	);
	const isSoldOut = soldPercentage >= 100;
	const isAlmostSoldOut = soldPercentage >= 85;

	if (viewMode === "list") {
		return (
			<Link href={`/events/${event.id}`}>
				<div className="group relative overflow-hidden rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm transition-all duration-300 hover:bg-white/[0.07] hover:border-white/[0.12] hover:shadow-lg hover:shadow-white/[0.02]">
					<div
						className={`absolute inset-0 bg-gradient-to-r ${style.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
					/>
					<div className="relative flex flex-col sm:flex-row items-start gap-4 p-5">
						{/* Date block */}
						<div className="flex-shrink-0 w-16 h-16 rounded-xl bg-white/[0.06] border border-white/[0.08] flex flex-col items-center justify-center">
							<span className="text-xs text-gray-500 uppercase font-bold tracking-wider">
								{new Date(event.startDate).toLocaleDateString(
									"en-US",
									{month: "short"},
								)}
							</span>
							<span className="text-xl font-bold text-white leading-none">
								{new Date(event.startDate).getDate()}
							</span>
						</div>

						{/* Content */}
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2 mb-1.5">
								<span
									className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${style.badge}`}
								>
									{event.category}
								</span>
								{event.ticketPrice === 0 && (
									<span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
										Free
									</span>
								)}
							</div>
							<h3 className="text-lg font-bold text-white truncate group-hover:text-white/95">
								{event.title}
							</h3>
							<p className="text-sm text-gray-500 line-clamp-1 mt-0.5">
								{event.description}
							</p>
						</div>

						{/* Meta */}
						<div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-1.5 flex-shrink-0">
							<div className="text-right">
								<div className="text-lg font-bold text-white">
									{event.ticketPrice === 0
										? "Free"
										: `$${event.ticketPrice}`}
								</div>
								<div className="text-[11px] text-gray-600">
									{event.location}
								</div>
							</div>
							<div
								className={`text-[11px] font-medium ${
									isSoldOut
										? "text-red-400"
										: isAlmostSoldOut
											? "text-amber-400"
											: "text-gray-500"
								}`}
							>
								{isSoldOut
									? "Sold Out"
									: `${event.soldTickets}/${event.totalTickets} sold`}
							</div>
						</div>
					</div>
				</div>
			</Link>
		);
	}

	return (
		<Link href={`/events/${event.id}`}>
			<div className="group relative overflow-hidden rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm transition-all duration-300 hover:bg-white/[0.07] hover:border-white/[0.12] hover:shadow-xl hover:shadow-white/[0.03] hover:-translate-y-1 h-full flex flex-col">
				{/* Top gradient accent */}
				<div
					className={`h-1 w-full bg-gradient-to-r ${style.gradient.replace("/20", "/60")}`}
				/>

				{/* Header area with date + category */}
				<div className="flex items-center justify-between px-5 pt-4 pb-2">
					<span
						className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${style.badge}`}
					>
						{event.category}
					</span>
					{event.ticketPrice === 0 ? (
						<span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
							Free
						</span>
					) : (
						<span className="text-lg font-bold text-white">
							${event.ticketPrice}
						</span>
					)}
				</div>

				{/* Content */}
				<div className="px-5 pb-4 flex-1 flex flex-col">
					<h3 className="text-lg font-bold text-white mb-1.5 line-clamp-2 group-hover:text-white/95">
						{event.title}
					</h3>
					<p className="text-sm text-gray-500 line-clamp-2 mb-4 flex-1">
						{event.description}
					</p>

					{/* Meta details */}
					<div className="space-y-2">
						<div className="flex items-center gap-2 text-sm text-gray-400">
							<svg
								className="w-4 h-4 flex-shrink-0 text-gray-600"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={1.5}
									d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
								/>
							</svg>
							<span>
								{formatDate(event.startDate)} ·{" "}
								{formatTime(event.startDate)}
							</span>
						</div>
						<div className="flex items-center gap-2 text-sm text-gray-400">
							<svg
								className="w-4 h-4 flex-shrink-0 text-gray-600"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={1.5}
									d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
								/>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={1.5}
									d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
								/>
							</svg>
							<span className="truncate">{event.location}</span>
						</div>
					</div>

					{/* Ticket progress */}
					<div className="mt-4 pt-3 border-t border-white/[0.06]">
						<div className="flex items-center justify-between mb-1.5">
							<span
								className={`text-[11px] font-medium ${
									isSoldOut
										? "text-red-400"
										: isAlmostSoldOut
											? "text-amber-400"
											: "text-gray-500"
								}`}
							>
								{isSoldOut
									? "Sold Out"
									: isAlmostSoldOut
										? "Almost Sold Out"
										: `${event.soldTickets} / ${event.totalTickets} tickets`}
							</span>
							<span className="text-[11px] text-gray-600">
								{soldPercentage}%
							</span>
						</div>
						<div className="w-full h-1 rounded-full bg-white/[0.06] overflow-hidden">
							<div
								className={`h-full rounded-full transition-all duration-500 ${
									isSoldOut
										? "bg-red-500/60"
										: isAlmostSoldOut
											? "bg-amber-500/60"
											: "bg-blue-500/40"
								}`}
								style={{
									width: `${Math.min(soldPercentage, 100)}%`,
								}}
							/>
						</div>
					</div>
				</div>
			</div>
		</Link>
	);
}
