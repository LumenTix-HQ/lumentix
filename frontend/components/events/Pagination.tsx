"use client";

interface PaginationProps {
	page: number;
	totalPages: number;
	total: number;
	limit: number;
	onPageChange: (page: number) => void;
}

export default function Pagination({
	page,
	totalPages,
	total,
	limit,
	onPageChange,
}: PaginationProps) {
	if (totalPages <= 1) return null;

	const start = (page - 1) * limit + 1;
	const end = Math.min(page * limit, total);

	// Generate page numbers to display
	const getPageNumbers = (): (number | "...")[] => {
		const pages: (number | "...")[] = [];

		if (totalPages <= 7) {
			for (let i = 1; i <= totalPages; i++) pages.push(i);
		} else {
			pages.push(1);

			if (page > 3) pages.push("...");

			const rangeStart = Math.max(2, page - 1);
			const rangeEnd = Math.min(totalPages - 1, page + 1);

			for (let i = rangeStart; i <= rangeEnd; i++) pages.push(i);

			if (page < totalPages - 2) pages.push("...");

			pages.push(totalPages);
		}

		return pages;
	};

	return (
		<div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
			<p className="text-sm text-gray-600">
				Showing{" "}
				<span className="text-gray-400 font-medium">
					{start}–{end}
				</span>{" "}
				of <span className="text-gray-400 font-medium">{total}</span>{" "}
				events
			</p>

			<div className="flex items-center gap-1.5">
				{/* Previous */}
				<button
					onClick={() => onPageChange(page - 1)}
					disabled={page <= 1}
					className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-gray-500 hover:bg-white/[0.08] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
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
							d="M15 19l-7-7 7-7"
						/>
					</svg>
				</button>

				{/* Page numbers */}
				{getPageNumbers().map((p, i) =>
					p === "..." ? (
						<span
							key={`dots-${i}`}
							className="px-2 text-gray-700 text-sm"
						>
							…
						</span>
					) : (
						<button
							key={p}
							onClick={() => onPageChange(p)}
							className={`min-w-[36px] h-9 rounded-lg text-sm font-medium border transition-all duration-200 ${
								p === page
									? "bg-blue-500/20 text-blue-400 border-blue-500/30"
									: "bg-white/[0.03] text-gray-500 border-white/[0.06] hover:bg-white/[0.07] hover:text-white"
							}`}
						>
							{p}
						</button>
					),
				)}

				{/* Next */}
				<button
					onClick={() => onPageChange(page + 1)}
					disabled={page >= totalPages}
					className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-gray-500 hover:bg-white/[0.08] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
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
							d="M9 5l7 7-7 7"
						/>
					</svg>
				</button>
			</div>
		</div>
	);
}
