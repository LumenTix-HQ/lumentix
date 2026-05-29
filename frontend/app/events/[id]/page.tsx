import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Event } from "@/types/event";
import EventDetailClient from "@/components/events/EventDetailClient";

const MOCK_EVENTS: Record<string, Event> = {
  "e1a2b3c4-d5e6-7890-abcd-ef1234567890": {
    id: "e1a2b3c4-d5e6-7890-abcd-ef1234567890",
    title: "Stellar Horizons Conference 2026",
    description: "The largest annual gathering of Stellar developers, founders, and enthusiasts. Three days of talks, workshops, and networking that will shape the future of decentralized finance.",
    location: "San Francisco, CA",
    startDate: "2026-04-15T09:00:00Z",
    endDate: "2026-04-17T18:00:00Z",
    ticketPrice: 299,
    currency: "USD",
    organizerId: "org-001",
    organizerName: "Stellar Foundation",
    status: "published" as any,
    category: "Conference" as any,
    imageUrl: "",
    totalTickets: 2000,
    soldTickets: 1456,
    vipTiers: [
      { id: "vip-001", eventId: "e1a2b3c4-d5e6-7890-abcd-ef1234567890", name: "bronze" as any, price: 499, maxSlots: 200, filledSlots: 120, benefits: ["Early Entry", "Exclusive Merch Pack"], createdAt: "2026-01-12T12:00:00Z" },
      { id: "vip-002", eventId: "e1a2b3c4-d5e6-7890-abcd-ef1234567890", name: "gold" as any, price: 999, maxSlots: 100, filledSlots: 85, benefits: ["Front Row Seating", "After Party Access", "Meet & Greet", "Exclusive Merch"], createdAt: "2026-01-12T12:00:00Z" },
      { id: "vip-003", eventId: "e1a2b3c4-d5e6-7890-abcd-ef1234567890", name: "platinum" as any, price: 2499, maxSlots: 25, filledSlots: 22, benefits: ["Everything in Gold", "Private Dinner with Speakers", "Hotel Accommodation", "Airport Transfer"], createdAt: "2026-01-12T12:00:00Z" },
    ],
    venueSections: [
      { id: "sec-001", eventId: "e1a2b3c4-d5e6-7890-abcd-ef1234567890", name: "Main Hall A", category: "General" as any, rows: 5, seatsPerRow: 6, createdAt: "2026-01-14T12:00:00Z" },
      { id: "sec-002", eventId: "e1a2b3c4-d5e6-7890-abcd-ef1234567890", name: "VIP Box", category: "VIP" as any, rows: 3, seatsPerRow: 4, createdAt: "2026-01-14T12:00:00Z" },
    ],
    accessibilityInventory: [
      { id: "acc-001", eventId: "e1a2b3c4-d5e6-7890-abcd-ef1234567890", type: "wheelchair" as any, totalSlots: 20, bookedSlots: 8, description: "Wheelchair-accessible seating in all halls", createdAt: "2026-01-15T12:00:00Z" },
      { id: "acc-002", eventId: "e1a2b3c4-d5e6-7890-abcd-ef1234567890", type: "hearing" as any, totalSlots: 15, bookedSlots: 5, description: "Hearing assist devices and sign language interpretation", createdAt: "2026-01-15T12:00:00Z" },
    ],
    createdAt: "2026-01-10T12:00:00Z",
    updatedAt: "2026-02-20T08:00:00Z",
  },
};

// ---------------------------------------------------------------------------
// Dynamic Open Graph / Twitter meta tags — issue #502
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  // In production this would fetch from the API; for now we use mock data.
  const event = MOCK_EVENTS[params.id];

  if (!event) {
    return {
      title: "Event not found | Lumentix",
    };
  }

  const imageUrl = event.imageUrl || "/og-default.png";

  return {
    title: `${event.title} | Lumentix`,
    description: event.description,
    openGraph: {
      title: event.title,
      description: event.description,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: event.title }],
      type: "website",
      url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/events/${event.id}`,
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description: event.description,
      images: [imageUrl],
    },
  };
}

export default function EventDetailPage({ params }: { params: { id: string } }) {
  const event = MOCK_EVENTS[params.id];
  if (!event) notFound();

  return <EventDetailClient event={event} />;
}
