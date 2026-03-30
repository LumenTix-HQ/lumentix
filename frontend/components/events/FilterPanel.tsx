"use client";

import {useState} from "react";
import {EventCategory, EventStatus, EventFilters} from "@/types/event";

interface FilterPanelProps {
	filters: EventFilters;
	onChange: (filters: EventFilters) => void;
	activeCount: number;
}

const ALL_CATEGORIES = Object.values(EventCategory);
const ALL_STATUSES = Object.values(EventStatus);

export default function FilterPanel({
	filters,
	onChange,
	activeCount,
}: FilterPanelProps) {
	const [isOpen, setIsOpen] = useState(false);

	const toggleCategory = (cat: EventCategory) => {
		const updated = filters.categories.includes(cat)
			? filters.categories.filter((c) => c !== cat)
			: [...filters.categories, cat];
		onChange({...filters, categories: updated});
	};

	const clearAll = () => {
		onChange({
			search: filters.search,
			categories: [],
			dateFrom: "",
			dateTo: "",
			priceMin: "",
			priceMax: "",
			status: "",
		});
	};

	return (
		<div className="relative">
			{/* Toggle button */}
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-gray-400 hover:bg-white/[0.07] hover:text-white hover:border-white/[0.12] transition-all duration-200"
			>
				<svg
					className="w-4 h-4"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
					/>
				</svg>
				Filters
				{activeCount > 0 && (
					<span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500/30 text-blue-400 text-[10px] font-bold border border-blue-500/30">
						{activeCount}
					</span>
				)}
				<svg
					className={`w-3 h-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M19 9l-7 7-7-7"
					/>
				</svg>
			</button>

			{/* Filter panel */}
			{isOpen && (
				<div className="absolute top-full left-0 right-0 mt-2 p-5 bg-[#0d0d12]/95 border border-white/[0.08] rounded-2xl backdrop-blur-xl shadow-2xl shadow-black/40 z-40 min-w-[320px] sm:min-w-[480px]">
					{/* Header */}
					<div className="flex items-center justify-between mb-4">
						<h3 className="text-sm font-semibold text-white">
							Filter Events
						</h3>
						{activeCount > 0 && (
							<button
								onClick={clearAll}
								className="text-xs text-gray-500 hover:text-red-400 transition-colors"
							>
								Clear all
							</button>
						)}
					</div>

					{/* Categories */}
					<div className="mb-5">
						<label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2.5">
							Category
						</label>
						<div className="flex flex-wrap gap-2">
							{ALL_CATEGORIES.map((cat) => {
								const isActive =
									filters.categories.includes(cat);
								return (
									<button
										key={cat}
										onClick={() => toggleCategory(cat)}
										className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 ${
											isActive
												? "bg-blue-500/20 text-blue-400 border-blue-500/30"
												: "bg-white/[0.03] text-gray-500 border-white/[0.06] hover:bg-white/[0.06] hover:text-gray-300"
										}`}
									>
										{cat}
									</button>
								);
							})}
						</div>
					</div>

					{/* Date range */}
					<div className="mb-5">
						<label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2.5">
							Date Range
						</label>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="block text-[10px] text-gray-600 mb-1">
									From
								</label>
								<input
									type="date"
									value={filters.dateFrom}
									onChange={(e) =>
										onChange({
											...filters,
											dateFrom: e.target.value,
										})
									}
									className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-all [color-scheme:dark]"
								/>
							</div>
							<div>
								<label className="block text-[10px] text-gray-600 mb-1">
									To
								</label>
								<input
									type="date"
									value={filters.dateTo}
									onChange={(e) =>
										onChange({
											...filters,
											dateTo: e.target.value,
										})
									}
									className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-all [color-scheme:dark]"
								/>
							</div>
						</div>
					</div>

					{/* Price range */}
					<div className="mb-5">
						<label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2.5">
							Price Range (USD)
						</label>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="block text-[10px] text-gray-600 mb-1">
									Min
								</label>
								<input
									type="number"
									min="0"
									value={filters.priceMin}
									onChange={(e) =>
										onChange({
											...filters,
											priceMin: e.target.value,
										})
									}
									placeholder="0"
									className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-white placeholder:text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-all"
								/>
							</div>
							<div>
								<label className="block text-[10px] text-gray-600 mb-1">
									Max
								</label>
								<input
									type="number"
									min="0"
									value={filters.priceMax}
									onChange={(e) =>
										onChange({
											...filters,
											priceMax: e.target.value,
										})
									}
									placeholder="Any"
									className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-white placeholder:text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-all"
								/>
							</div>
						</div>
					</div>

					{/* Status */}
					<div>
						<label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2.5">
							Status
						</label>
						<div className="flex flex-wrap gap-2">
							<button
								onClick={() =>
									onChange({...filters, status: ""})
								}
								className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 ${
									!filters.status
										? "bg-blue-500/20 text-blue-400 border-blue-500/30"
										: "bg-white/[0.03] text-gray-500 border-white/[0.06] hover:bg-white/[0.06] hover:text-gray-300"
								}`}
							>
								All
							</button>
							{ALL_STATUSES.map((status) => (
								<button
									key={status}
									onClick={() =>
										onChange({...filters, status})
									}
									className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 capitalize ${
										filters.status === status
											? "bg-blue-500/20 text-blue-400 border-blue-500/30"
											: "bg-white/[0.03] text-gray-500 border-white/[0.06] hover:bg-white/[0.06] hover:text-gray-300"
									}`}
								>
									{status}
								</button>
							))}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
