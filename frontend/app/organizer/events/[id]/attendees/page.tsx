"use client";

import { useCallback } from "react";
import Link from "next/link";
import AttendeeTable, { type AttendeeRow } from "@/components/AttendeeTable";
import { useAttendees } from "@/hooks/useAttendees";

export default function AttendeesPage({ params }: { params: { id: string } }) {
  const { id: eventId } = params;

  const {
    filteredRows,
    search,
    setSearch,
    highlightedIds,
    isLoading,
    error,
    lastUpdated,
    handleExport,
  } = useAttendees(eventId);

  const copyToClipboard = useCallback(async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
    } catch {
      // fallback
      const el = document.createElement('textarea');
      el.value = key;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-tr from-black via-gray-900 to-purple-950 px-4 pb-16 pt-28 text-white sm:px-8">
      <div className="mx-auto w-full max-w-7xl">
        {/* Breadcrumb */}
        <nav className="mb-4 text-sm text-gray-400" aria-label="Breadcrumb">
          <ol className="flex items-center gap-2">
            <li><Link href="/organizer/dashboard" className="hover:text-purple-300 transition-colors">Dashboard</Link></li>
            <li><span className="text-gray-600">/</span></li>
            <li><Link href={`/organizer/events/${eventId}/edit`} className="hover:text-purple-300 transition-colors">Event</Link></li>
            <li><span className="text-gray-600">/</span></li>
            <li className="text-purple-300 font-medium" aria-current="page">Attendees</li>
          </ol>
        </nav>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-purple-300 to-pink-400 bg-clip-text text-3xl font-extrabold text-transparent sm:text-4xl">
              Attendees
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              Live registration list — refreshes automatically every 30&nbsp;seconds.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/organizer/events/${eventId}/edit`}
              className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-gray-100 transition hover:bg-white/10"
            >
              Back to event
            </Link>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full max-w-md items-center gap-2">
            <label htmlFor="attendee-search" className="sr-only">
              Search attendees
            </label>
            <input
              id="attendee-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email..."
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all focus:border-purple-400"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400" aria-live="polite">
              {isLoading
                ? "Loading..."
                : lastUpdated
                    ? `Updated ${lastUpdated.toLocaleTimeString()}`
                    : ""}
            </span>
            <button
              type="button"
              onClick={handleExport}
              disabled={filteredRows.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2.5 text-sm font-bold text-white transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg className="h-4 w-4" aria-hidden="true" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 3a1 1 0 0 1 1 1v7.586l2.293-2.293a1 1 0 1 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L9 11.586V4a1 1 0 0 1 1-1z" />
                <path d="M4 15a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1z" />
              </svg>
              Export CSV ({filteredRows.length})
            </button>
          </div>
        </div>

        {error ? (
          <p className="mb-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-200" role="alert">
            {error}
          </p>
        ) : null}

        <AttendeeTable
          rows={filteredRows}
          highlightedIds={highlightedIds}
          emptyMessage={
            search
              ? `No attendees match "${search}".`
              : "No attendees have registered yet."
          }
        />

        {/* Copy button for Stellar public key */}
        {filteredRows.length > 0 && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => {
                const keys = filteredRows.map(r => r.stellarPublicKey).filter(Boolean) as string[];
                if (keys.length > 0) {
                  copyToClipboard(keys.join('\n'));
                }
              }}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Copy all public keys
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
