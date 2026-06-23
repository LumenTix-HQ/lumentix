import type {Config} from "tailwindcss";

const config: Config = {
	content: [
		"./pages/**/*.{js,ts,jsx,tsx,mdx}",
		"./components/**/*.{js,ts,jsx,tsx,mdx}",
		"./app/**/*.{js,ts,jsx,tsx,mdx}",
	],
	theme: {
		extend: {
			colors: {
				background: "var(--background)",
				foreground: "var(--foreground)",
			},
			fontFamily: {
				sans: ["Inter", "system-ui", "sans-serif"],
			},
			keyframes: {
				'toast-in': {
					'0%': { opacity: '0', transform: 'translateX(110%)' },
					'100%': { opacity: '1', transform: 'translateX(0)' },
				},
				'row-highlight': {
					'0%': { backgroundColor: 'rgb(16 185 129 / 0.30)' },
					'100%': { backgroundColor: 'rgb(16 185 129 / 0)' },
				},
			},
			animation: {
				'toast-in': 'toast-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
				'row-highlight': 'row-highlight 3s ease-out forwards',
			},
		},
	},
	plugins: [],
};
export default config;
