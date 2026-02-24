import type {Metadata} from "next";

export const metadata: Metadata = {
	title: "Events - Lumentix",
	description: "Events",
};

export default function EventsLayout({children}: {children: React.ReactNode}) {
	return <>{children}</>;
}
