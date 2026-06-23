import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Lumentix",
        short_name: "Lumentix",
        description: "Event management and ticketing for Lumentix organizers and attendees.",
        start_url: "/",
        display: "standalone",
        background_color: "#050014",
        theme_color: "#7c3aed",
        icons: [
            { src: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
            { src: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
        ],
    };
}
