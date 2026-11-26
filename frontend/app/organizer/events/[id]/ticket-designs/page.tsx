"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { TicketDesignBuilder } from "@/components/TicketDesignBuilder";

export default function OrganizerTicketDesignsPage({ params }: { params: { id: string } }) {
  const { id: eventId } = params;
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push(`/login?redirect=/organizer/events/${eventId}/ticket-designs`);
    }
  }, [eventId, isLoading, router, user]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <nav className="flex items-center gap-2 text-xs text-slate-400" aria-label="Breadcrumb">
          <Link href="/organizer/dashboard" className="hover:text-violet-300">Organizer Dashboard</Link>
          <span>/</span>
          <Link href={`/events/${eventId}`} className="hover:text-violet-300">Event</Link>
          <span>/</span>
          <span className="text-slate-200" aria-current="page">Ticket design</span>
        </nav>
        <TicketDesignBuilder eventId={eventId} />
      </div>
    </main>
  );
}
