"use client";

interface EmptyStateProps {
	hasFilters: boolean;
	onClearFilters: () => void;
}

export default function EmptyState({
	hasFilters,
	onClearFilters,
}: EmptyStateProps) {
	return (
		<div className="flex flex-col items-center justify-center py-20 text-center">
			{/* Empty icon */}
			<div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
				<svg
					className="w-10 h-10 text-gray-600"
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
			</div>

			<h3 className="text-xl font-bold text-white mb-2">
				No events found
			</h3>
			<p className="text-sm text-gray-500 max-w-md mb-8">
				{hasFilters
					? "No events match your current search or filters. Try adjusting your criteria or clear all filters."
					: "There are no upcoming events at the moment. Check back soon for new events!"}
			</p>

			{hasFilters && (
				<button
					onClick={onClearFilters}
					className="px-6 py-3 bg-white/[0.06] border border-white/[0.1] rounded-xl text-sm font-medium text-white hover:bg-white/[0.1] hover:border-white/[0.15] transition-all duration-200 active:scale-95"
				>
					Clear All Filters
				</button>
			)}
		</div>
	);
}
