'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RevenueChart } from '@/components/RevenueChart';
import { EscrowBalanceCard } from '@/components/EscrowBalanceCard';

interface OrganizerEvent {
  id: string;
  title: string;
  status: 'active' | 'cancelled' | 'completed' | 'draft' | string;
  date: string;
  ticketsSold: number;
  totalTickets: number;
  revenue: number;
  escrowExpected: number;
  escrowActual: number;
  revenueHistory?: { label: string; value: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-900/50 text-green-300 border-green-700',
  cancelled: 'bg-red-900/50 text-red-300 border-red-700',
  completed: 'bg-blue-900/50 text-blue-300 border-blue-700',
  draft: 'bg-gray-700/50 text-gray-300 border-gray-600',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cls} capitalize`}>
      {status}
    </span>
  );
}

export default function OrganizerDashboardPage() {
  const router = useRouter();
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<OrganizerEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

  const fetchEvents = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/events?organizerId=me`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error(`Failed to load events (${res.status})`);
      const data = await res.json();
      const list: OrganizerEvent[] = Array.isArray(data) ? data : data.items ?? data.events ?? [];
      setEvents(list);
      if (list.length > 0) setSelectedEvent(list[0]);
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    const token = localStorage.getItem('lumentix_access_token');
    const role = localStorage.getItem('lumentix_user_role');

    if (!token) {
      router.replace('/login');
      return;
    }
    if (role && role !== 'organizer') {
      router.replace('/');
      return;
    }
    fetchEvents(token);
  }, [fetchEvents, router]);

  const handleCancelEvent = async () => {
    if (!selectedEvent) return;
    const token = localStorage.getItem('lumentix_access_token');
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/events/${selectedEvent.id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to cancel event');
      setActionMessage('Event cancelled successfully.');
      setEvents((prev) =>
        prev.map((e) =>
          e.id === selectedEvent.id ? { ...e, status: 'cancelled' } : e,
        ),
      );
      setSelectedEvent((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    }
  };

  const handleDownloadCSV = () => {
    if (!selectedEvent) return;
    const header = 'id,title,status,date,ticketsSold,totalTickets,revenue';
    const row = [
      selectedEvent.id,
      `"${selectedEvent.title}"`,
      selectedEvent.status,
      selectedEvent.date,
      selectedEvent.ticketsSold,
      selectedEvent.totalTickets,
      selectedEvent.revenue,
    ].join(',');
    const csv = `${header}\n${row}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event-${selectedEvent.id}-summary.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const soldPct =
    selectedEvent && selectedEvent.totalTickets > 0
      ? Math.round((selectedEvent.ticketsSold / selectedEvent.totalTickets) * 100)
      : 0;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold text-white">Organizer Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">Manage your events and revenue</p>
      </header>

      {actionMessage && (
        <div className="mx-6 mt-4 rounded-lg bg-indigo-900/40 border border-indigo-700 px-4 py-3 text-sm text-indigo-200 flex justify-between items-center">
          <span>{actionMessage}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-indigo-400 hover:text-white ml-4"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex h-[calc(100vh-73px)]">
        {/* Left panel — event list */}
        <aside className="w-80 shrink-0 border-r border-gray-800 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Your Events
            </h2>

            {loading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg bg-gray-800 animate-pulse h-20" />
                ))}
              </div>
            )}

            {!loading && error && (
              <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {!loading && !error && events.length === 0 && (
              <p className="text-sm text-gray-500">No events found.</p>
            )}

            {!loading && !error && events.length > 0 && (
              <ul className="space-y-2" role="list">
                {events.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedEvent(event)}
                      className={`w-full text-left rounded-lg p-3 border transition-colors ${
                        selectedEvent?.id === event.id
                          ? 'border-indigo-600 bg-indigo-900/30'
                          : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2 mb-1">
                        <span className="text-sm font-medium text-white line-clamp-1">
                          {event.title}
                        </span>
                        <StatusBadge status={event.status} />
                      </div>
                      <p className="text-xs text-gray-400">
                        {new Date(event.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Right panel — selected event details */}
        <section className="flex-1 overflow-y-auto p-6">
          {!selectedEvent ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              Select an event to view details.
            </div>
          ) : (
            <div className="max-w-3xl space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">{selectedEvent.title}</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    {new Date(selectedEvent.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <StatusBadge status={selectedEvent.status} />
              </div>

              {/* Key metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
                  <p className="text-xs text-gray-400 mb-1">Tickets Sold</p>
                  <p className="text-2xl font-bold text-white">
                    {selectedEvent.ticketsSold.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    of {selectedEvent.totalTickets.toLocaleString()} ({soldPct}%)
                  </p>
                  <div className="w-full bg-gray-700 rounded-full h-1.5 mt-2">
                    <div
                      className="h-1.5 rounded-full bg-indigo-500"
                      style={{ width: `${soldPct}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
                  <p className="text-xs text-gray-400 mb-1">Total Revenue</p>
                  <p className="text-2xl font-bold text-white">
                    {selectedEvent.revenue.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">XLM</p>
                </div>

                <div className="rounded-xl border border-gray-700 bg-gray-800 p-4 col-span-2 sm:col-span-1">
                  <p className="text-xs text-gray-400 mb-1">Remaining Capacity</p>
                  <p className="text-2xl font-bold text-white">
                    {(selectedEvent.totalTickets - selectedEvent.ticketsSold).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">seats available</p>
                </div>
              </div>

              {/* Revenue chart */}
              <RevenueChart
                data={
                  selectedEvent.revenueHistory ?? [
                    { label: 'Week 1', value: Math.round(selectedEvent.revenue * 0.2) },
                    { label: 'Week 2', value: Math.round(selectedEvent.revenue * 0.3) },
                    { label: 'Week 3', value: Math.round(selectedEvent.revenue * 0.25) },
                    { label: 'Week 4', value: Math.round(selectedEvent.revenue * 0.25) },
                  ]
                }
                currency="XLM"
              />

              {/* Escrow balance */}
              <EscrowBalanceCard
                expected={selectedEvent.escrowExpected ?? selectedEvent.revenue}
                actual={selectedEvent.escrowActual ?? selectedEvent.revenue}
                currency="XLM"
              />

              {/* Quick actions */}
              <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
                <h3 className="text-sm font-medium text-gray-400 mb-4">Quick Actions</h3>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleCancelEvent}
                    disabled={selectedEvent.status === 'cancelled'}
                    className="rounded-lg bg-red-800 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition-colors"
                  >
                    Cancel Event
                  </button>

                  <a
                    href={`/organizer/events/${selectedEvent.id}/attendees`}
                    className="rounded-lg border border-gray-600 hover:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
                  >
                    View Attendees
                  </a>

                  <button
                    type="button"
                    onClick={handleDownloadCSV}
                    className="rounded-lg border border-gray-600 hover:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
                  >
                    Download CSV
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
