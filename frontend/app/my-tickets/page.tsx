"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken, setTokens } from "@/lib/auth/auth";
import TicketCard, { Ticket } from "@/components/TicketCard";

type Tab = "upcoming" | "past" | "cancelled" | "refundable";

interface Registration {
  id: string;
  event: {
    title: string;
    startDate: string;
  };
  status: "confirmed" | "cancelled" | "pending";
  qrUrl?: string;
  refundEligibleUntil?: string;
  refundAmount?: number;
  currency?: string;
}

function toTicket(reg: Registration): Ticket {
  return {
    id: reg.id,
    eventTitle: reg.event.title,
    eventDate: reg.event.startDate,
    status: reg.status,
    qrUrl: reg.qrUrl,
  };
}

function groupTickets(tickets: Ticket[], registrations: Registration[]): Record<Tab, Ticket[]> {
  const now = new Date();

  const refundableIds = new Set(
    registrations
      .filter((r) => r.refundEligibleUntil && new Date(r.refundEligibleUntil) > now && r.status === "confirmed")
      .map((r) => r.id)
  );

  return {
    upcoming: tickets.filter(
      (t) => t.status !== "cancelled" && new Date(t.eventDate) >= now && !refundableIds.has(t.id)
    ),
    past: tickets.filter(
      (t) => t.status !== "cancelled" && new Date(t.eventDate) < now
    ),
    cancelled: tickets.filter((t) => t.status === "cancelled"),
    refundable: tickets.filter((t) => refundableIds.has(t.id)),
  };
}

const TAB_LABELS: Record<Tab, string> = {
  upcoming: "Upcoming",
  past: "Past",
  cancelled: "Cancelled",
  refundable: "Request Refund",
};

export default function MyTicketsPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("upcoming");
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [refundSuccess, setRefundSuccess] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login?redirect=/my-tickets");
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

    fetch(`${apiUrl}/users/me/registrations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((data: Registration[]) => {
        setRegistrations(data);
        setTickets(data.map(toTicket));
      })
      .catch(() => {
        setError("Failed to load your tickets. Please try again.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router]);

  const handleRefund = async (registrationId: string) => {
    const token = getAccessToken();
    if (!token) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

    setRefundingId(registrationId);
    try {
      const res = await fetch(`${apiUrl}/registrations/${registrationId}/refund`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Refund request failed");
      setRefundSuccess("Refund request submitted successfully.");
      setRegistrations((prev) =>
        prev.map((r) => (r.id === registrationId ? { ...r, status: "cancelled" as const, refundEligibleUntil: undefined } : r))
      );
      setTickets((prev) => prev.map((t) => (t.id === registrationId ? { ...t, status: "cancelled" as const } : t)));
    } catch {
      setError("Failed to process refund. Please try again.");
    } finally {
      setRefundingId(null);
    }
  };

  const grouped = groupTickets(tickets, registrations);
  const tabTickets = grouped[activeTab];

  return (
    <main className="min-h-screen bg-gray-900 text-white pt-24 pb-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <h1 className="text-3xl font-bold mb-8">My Tickets</h1>

        {refundSuccess && (
          <div className="mb-4 p-3 rounded-xl bg-green-500/15 border border-green-500/30 text-sm text-green-300">
            {refundSuccess}
          </div>
        )}

        <div className="flex gap-1 mb-8 bg-gray-800 rounded-xl p-1 w-fit flex-wrap">
          {(["upcoming", "past", "cancelled", "refundable"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {TAB_LABELS[tab]}
              {grouped[tab].length > 0 && (
                <span className={`ml-1.5 text-xs ${activeTab === tab ? "text-blue-200" : "text-gray-500"}`}>
                  ({grouped[tab].length})
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-gray-800 rounded-xl p-5 border border-gray-700 h-36 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-red-400">{error}</p>
          </div>
        ) : tabTickets.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg">
              {activeTab === "upcoming" && "No upcoming tickets yet."}
              {activeTab === "past" && "No past events found."}
              {activeTab === "cancelled" && "No cancelled tickets."}
              {activeTab === "refundable" && "No tickets eligible for refund."}
            </p>
            {activeTab === "upcoming" && (
              <a href="/events" className="mt-4 inline-block text-blue-400 hover:text-blue-300 transition underline">
                Browse events
              </a>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {tabTickets.map((ticket) => (
              <div key={ticket.id} className="relative">
                <TicketCard ticket={ticket} />
                {activeTab === "refundable" && (
                  <button
                    onClick={() => handleRefund(ticket.id)}
                    disabled={refundingId === ticket.id}
                    className="mt-2 w-full py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                  >
                    {refundingId === ticket.id ? "Processing..." : "Request Refund"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
