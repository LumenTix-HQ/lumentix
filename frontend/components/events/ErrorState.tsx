"use client";

interface ErrorStateProps {
	message?: string;
	onRetry: () => void;
}

export default function ErrorState({message, onRetry}: ErrorStateProps) {
	return (
		<div className="relative flex flex-col items-center justify-center py-20 text-center">
			{/* Ambient glow */}
			<div className="absolute inset-0 overflow-hidden pointer-events-none opacity-15">
				<div className="absolute top-1/3 left-1/3 w-48 h-48 bg-red-500 rounded-full blur-[100px]" />
				<div className="absolute bottom-1/3 right-1/3 w-56 h-56 bg-orange-600 rounded-full blur-[120px]" />
			</div>

			<div className="relative z-10">
				{/* Error icon */}
				<div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
					<svg
						className="w-10 h-10 text-red-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={1.5}
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
				</div>

				<h3 className="text-xl font-bold text-white mb-2">
					Something went wrong
				</h3>
				<p className="text-sm text-gray-500 max-w-md mb-8">
					{message ||
						"We couldn't load the events. Please check your connection and try again."}
				</p>

				<button
					onClick={onRetry}
					className="px-6 py-3 bg-white/[0.06] border border-white/[0.1] rounded-xl text-sm font-medium text-white hover:bg-white/[0.1] hover:border-white/[0.15] transition-all duration-200 active:scale-95"
				>
					Try Again
				</button>
			</div>
		</div>
	);
}
