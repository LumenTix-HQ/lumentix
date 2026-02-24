interface EventCardSkeletonProps {
	viewMode: "grid" | "list";
}

export default function EventCardSkeleton({viewMode}: EventCardSkeletonProps) {
	if (viewMode === "list") {
		return (
			<div className="overflow-hidden rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5 animate-pulse">
				<div className="flex flex-col sm:flex-row items-start gap-4">
					<div className="flex-shrink-0 w-16 h-16 rounded-xl bg-white/[0.06]" />
					<div className="flex-1 min-w-0 space-y-2.5">
						<div className="flex items-center gap-2">
							<div className="h-4 w-16 rounded-full bg-white/[0.06]" />
						</div>
						<div className="h-5 w-3/4 rounded bg-white/[0.06]" />
						<div className="h-3 w-full rounded bg-white/[0.04]" />
					</div>
					<div className="flex-shrink-0 space-y-2 text-right">
						<div className="h-6 w-14 rounded bg-white/[0.06] ml-auto" />
						<div className="h-3 w-20 rounded bg-white/[0.04] ml-auto" />
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse h-full flex flex-col">
			<div className="h-1 w-full bg-white/[0.04]" />
			<div className="flex items-center justify-between px-5 pt-4 pb-2">
				<div className="h-4 w-16 rounded-full bg-white/[0.06]" />
				<div className="h-5 w-10 rounded bg-white/[0.06]" />
			</div>
			<div className="px-5 pb-4 flex-1 flex flex-col space-y-3">
				<div className="h-5 w-4/5 rounded bg-white/[0.06]" />
				<div className="space-y-1.5 flex-1">
					<div className="h-3 w-full rounded bg-white/[0.04]" />
					<div className="h-3 w-2/3 rounded bg-white/[0.04]" />
				</div>
				<div className="space-y-2 pt-2">
					<div className="flex items-center gap-2">
						<div className="h-4 w-4 rounded bg-white/[0.04]" />
						<div className="h-3 w-32 rounded bg-white/[0.04]" />
					</div>
					<div className="flex items-center gap-2">
						<div className="h-4 w-4 rounded bg-white/[0.04]" />
						<div className="h-3 w-24 rounded bg-white/[0.04]" />
					</div>
				</div>
				<div className="pt-3 border-t border-white/[0.06]">
					<div className="flex justify-between mb-1.5">
						<div className="h-3 w-24 rounded bg-white/[0.04]" />
						<div className="h-3 w-8 rounded bg-white/[0.04]" />
					</div>
					<div className="w-full h-1 rounded-full bg-white/[0.04]" />
				</div>
			</div>
		</div>
	);
}
