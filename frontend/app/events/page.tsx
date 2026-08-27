"use client";

import {useState, useEffect, useCallback, useRef} from "react";
import {Event, EventFilters} from "@/types/event";
import EventCard from "@/components/events/EventCard";
import EventCardSkeleton from "@/components/events/EventCardSkeleton";
import SearchBar from "@/components/events/SearchBar";
import FilterPanel from "@/components/events/FilterPanel";
import ErrorState from "@/components/events/ErrorState";
import EmptyState from "@/components/events/EmptyState";
import { useDebounce } from "@/hooks/useDebounce";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ITEMS_PER_PAGE = 12;

const DEFAULT_FILTERS: EventFilters = {
	search: "",
	categories: [],
	dateFrom: "",
	dateTo: "",
	priceMin: "",
	priceMax: "",
	status: "",
};

async function fetchEventsFromAPI(filters: EventFilters, page: number): Promise<Event[]> {
	const params = new URLSearchParams({
		page: String(page),
		limit: String(ITEMS_PER_PAGE),
	});
	if (filters.search) params.set("search", filters.search);
	if (filters.categories?.length) params.set("categoryIds", filters.categories.join(","));
	if (filters.status) params.set("status", filters.status);
	const res = await fetch(`${API_BASE}/events?${params}`);
	if (!res.ok) throw new Error("Failed to fetch events");
	const data = await res.json();
	return Array.isArray(data) ? data : (data.data ?? []);
}

export default function EventsPage() {
	const [filters, setFilters] = useState<EventFilters>(DEFAULT_FILTERS);
	const [searchInput, setSearchInput] = useState("");
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [events, setEvents] = useState<Event[]>([]);
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(true);
	const sentinelRef = useRef<HTMLDivElement>(null);

	const debouncedSearch = useDebounce(searchInput, 300);

	const loadEvents = useCallback(async (pg: number, reset: boolean) => {
		setIsLoading(true);
		setError(null);
		try {
			const activeFilters = { ...filters, search: debouncedSearch };
			const items = await fetchEventsFromAPI(activeFilters, pg);
			setEvents((prev) => (reset ? items : [...prev, ...items]));
			setHasMore(items.length === ITEMS_PER_PAGE);
		} catch {
			setError("Failed to load events. Please try again.");
		} finally {
			setIsLoading(false);
		}
	}, [filters, debouncedSearch]);

	// Reset and reload when filters or debounced search change
	useEffect(() => {
		setPage(1);
		loadEvents(1, true);
	}, [filters, debouncedSearch]);

	// Infinite scroll via Intersection Observer
	useEffect(() => {
		if (!sentinelRef.current) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && hasMore && !isLoading) {
					const next = page + 1;
					setPage(next);
					loadEvents(next, false);
				}
			},
			{ rootMargin: "200px" },
		);
		observer.observe(sentinelRef.current);
		return () => observer.disconnect();
	}, [hasMore, isLoading, page, loadEvents]);

	const handleFilterChange = (newFilters: EventFilters) => {
		setFilters(newFilters);
	};

	const handleSearchChange = (search: string) => {
		setSearchInput(search);
	};

	const clearAllFilters = () => {
		setFilters(DEFAULT_FILTERS);
		setPage(1);
	};

	// Count active filters (exclude search)
	const activeFilterCount =
		filters.categories.length +
		(filters.dateFrom ? 1 : 0) +
		(filters.dateTo ? 1 : 0) +
		(filters.priceMin ? 1 : 0) +
		(filters.priceMax ? 1 : 0) +
		(filters.status ? 1 : 0);

	const hasAnyFilters =
		activeFilterCount > 0 || filters.search.trim().length > 0;

	return (
		<main className="min-h-screen bg-[#060609] text-white">
			{/* Background ambient effects */}
			<div className="fixed inset-0 overflow-hidden pointer-events-none">
				<div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-blue-600/[0.04] rounded-full blur-[150px]" />
				<div className="absolute top-1/3 -right-32 w-[400px] h-[400px] bg-indigo-600/[0.04] rounded-full blur-[130px]" />
				<div className="absolute -bottom-20 left-1/3 w-[350px] h-[350px] bg-purple-600/[0.03] rounded-full blur-[120px]" />
			</div>

			<div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16">
				{/* Header */}
				<div className="text-center mb-12">
					<h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 mb-4 tracking-tight">
						Discover Events
					</h1>
					<p className="text-gray-500 text-base sm:text-lg max-w-2xl mx-auto">
						Explore upcoming events powered by the Stellar network.
						From workshops to festivals — find your next experience.
					</p>
				</div>

				{/* Controls bar */}
				<div className="flex flex-col gap-4 mb-8">
					{/* Search */}
					<SearchBar
						value={searchInput}
						onChange={handleSearchChange}
					/>

					{/* Filters + View toggle row */}
					<div className="flex items-center justify-between gap-3">
						<FilterPanel
							filters={filters}
							onChange={handleFilterChange}
							activeCount={activeFilterCount}
						/>

						{/* View toggle */}
						<div className="flex items-center gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-lg">
							<button
								onClick={() => setViewMode("grid")}
								className={`p-2 rounded-md transition-all duration-200 ${
									viewMode === "grid"
										? "bg-white/[0.08] text-white"
										: "text-gray-600 hover:text-gray-400"
								}`}
								title="Grid view"
							>
								<svg
									className="w-4 h-4"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z" />
								</svg>
							</button>
							<button
								onClick={() => setViewMode("list")}
								className={`p-2 rounded-md transition-all duration-200 ${
									viewMode === "list"
										? "bg-white/[0.08] text-white"
										: "text-gray-600 hover:text-gray-400"
								}`}
								title="List view"
							>
								<svg
									className="w-4 h-4"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z" />
								</svg>
							</button>
						</div>
					</div>

					{/* Active filter tags */}
					{hasAnyFilters && (
						<div className="flex items-center gap-2 flex-wrap">
							<span className="text-[11px] text-gray-600 uppercase tracking-wider font-medium">
								Active:
							</span>
							{filters.search && (
								<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-gray-400">
									&ldquo;{filters.search}&rdquo;
									<button
										onClick={() => handleSearchChange("")}
										className="text-gray-600 hover:text-white transition-colors"
									>
										×
									</button>
								</span>
							)}
							{filters.categories.map((cat) => (
								<span
									key={cat}
									className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400"
								>
									{cat}
									<button
										onClick={() =>
											handleFilterChange({
												...filters,
												categories:
													filters.categories.filter(
														(c) => c !== cat,
													),
											})
										}
										className="text-blue-500/60 hover:text-blue-300 transition-colors"
									>
										×
									</button>
								</span>
							))}
							{filters.dateFrom && (
								<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-gray-400">
									From: {filters.dateFrom}
									<button
										onClick={() =>
											handleFilterChange({
												...filters,
												dateFrom: "",
											})
										}
										className="text-gray-600 hover:text-white transition-colors"
									>
										×
									</button>
								</span>
							)}
							{filters.dateTo && (
								<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-gray-400">
									To: {filters.dateTo}
									<button
										onClick={() =>
											handleFilterChange({
												...filters,
												dateTo: "",
											})
										}
										className="text-gray-600 hover:text-white transition-colors"
									>
										×
									</button>
								</span>
							)}
							{filters.priceMin && (
								<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-gray-400">
									Min: ${filters.priceMin}
									<button
										onClick={() =>
											handleFilterChange({
												...filters,
												priceMin: "",
											})
										}
										className="text-gray-600 hover:text-white transition-colors"
									>
										×
									</button>
								</span>
							)}
							{filters.priceMax && (
								<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-gray-400">
									Max: ${filters.priceMax}
									<button
										onClick={() =>
											handleFilterChange({
												...filters,
												priceMax: "",
											})
										}
										className="text-gray-600 hover:text-white transition-colors"
									>
										×
									</button>
								</span>
							)}
							{filters.status && (
								<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-gray-400 capitalize">
									{filters.status}
									<button
										onClick={() =>
											handleFilterChange({
												...filters,
												status: "",
											})
										}
										className="text-gray-600 hover:text-white transition-colors"
									>
										×
									</button>
								</span>
							)}
							<button
								onClick={clearAllFilters}
								className="text-[11px] text-gray-600 hover:text-red-400 transition-colors ml-1"
							>
								Clear all
							</button>
						</div>
					)}
				</div>

				{/* Content */}
				{error ? (
					<ErrorState message={error} onRetry={() => loadEvents(1, true)} />
				) : !isLoading && events.length === 0 ? (
					<EmptyState
						hasFilters={hasAnyFilters}
						onClearFilters={clearAllFilters}
					/>
				) : (
					<>
						<div
							className={
								viewMode === "grid"
									? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
									: "flex flex-col gap-3"
							}
						>
							{events.map((event) => (
								<EventCard
									key={event.id}
									event={event}
									viewMode={viewMode}
								/>
							))}
							{isLoading &&
								Array.from({length: viewMode === "grid" ? 3 : 2}).map((_, i) => (
									<EventCardSkeleton key={`sk-${i}`} viewMode={viewMode} />
								))}
						</div>
						{/* Infinite scroll sentinel */}
						<div ref={sentinelRef} className="h-4 mt-4" />
						{!hasMore && events.length > 0 && (
							<p className="text-center text-gray-600 text-sm mt-6">
								All events loaded
							</p>
						)}
					</>
				)}
			</div>
		</main>
	);
}
