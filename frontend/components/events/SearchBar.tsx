"use client";

import {useEffect, useRef, useState} from "react";

interface SearchBarProps {
	value: string;
	onChange: (value: string) => void;
}

export default function SearchBar({value, onChange}: SearchBarProps) {
	const [localValue, setLocalValue] = useState(value);
	const debounceRef = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		setLocalValue(value);
	}, [value]);

	const handleChange = (newValue: string) => {
		setLocalValue(newValue);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			onChange(newValue);
		}, 300);
	};

	const handleClear = () => {
		setLocalValue("");
		onChange("");
	};

	return (
		<div className="relative group">
			{/* Search icon */}
			<svg
				className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 group-focus-within:text-gray-400 transition-colors"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>

			<input
				type="text"
				value={localValue}
				onChange={(e) => handleChange(e.target.value)}
				placeholder="Search events by name, description, or location..."
				className="w-full pl-12 pr-10 py-3.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/30 focus:bg-white/[0.06] transition-all duration-200"
			/>

			{/* Clear button */}
			{localValue && (
				<button
					onClick={handleClear}
					className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-600 hover:text-white hover:bg-white/10 transition-colors"
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
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			)}
		</div>
	);
}
