"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AttendeeTable, { type AttendeeRow } from "@/components/AttendeeTable";
import { exportToCsv, type CsvColumn } from "@/lib/utils/csv-export";
import { useDebounce } from "@/hooks/useDebounce";
import { getAccessToken } from "@/lib/auth/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const POLL_INTERVAL_MS = 30_000;
const HIGHLIGHT_DURATION_MS = 3_000;

/**
 * Shape returned by `GET /events/:id/registrations`. Backend currently stores
 * `userId`/`ticketId`/`paymentId`/`status` directly; the organizer endpoint is
 * expected to enrich with user fields. We accept any combination of these
 * field names so the page works whether or not the backend has been extended.
 */
interface ApiRegistration {
    id: string;
    eventId?: string;
    userId?: string;
    ticketId?: string | null;
    paymentId?: string | null;
    status?: string;
    paymentStatus?: string;
    createdAt?: string;
    registeredAt?: string;
    user?: {
        id?: string;
        name?: string | null;
        fullName?: string | null;
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
        stellarPublicKey?: string | null;
        walletPublicKey?: string | null;
        publicKey?: string | null;
    } | null;
    name?: string | null;
    email?: string | null;
    stellarPublicKey?: string | null;
    walletPublicKey?: string | null;
}

interface ApiPaginated<T> {
    data: T[];
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
}

function pickName(reg: ApiRegistration): string {
    const u = reg.user ?? {};
    if (reg.name) return reg.name;
    if (u.name) return u.name;
    if (u.fullName) return u.fullName;
    const composed = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
    return composed;
}

function pickStellarKey(reg: ApiRegistration): string | null {
    const u = reg.user ?? {};
    return (
        reg.stellarPublicKey ??
        reg.walletPublicKey ??
        u.stellarPublicKey ??
        u.walletPublicKey ??
        u.publicKey ??
        null
    );
}

function normalize(reg: ApiRegistration): AttendeeRow {
    return {
        id: reg.id,
        name: pickName(reg) || null,
        email: reg.email ?? reg.user?.email ?? null,
        stellarPublicKey: pickStellarKey(reg),
        registeredAt: reg.registeredAt ?? reg.createdAt ?? null,
        paymentStatus: reg.paymentStatus ?? reg.status ?? null,
        ticketId: reg.ticketId ?? null,
    };
}

async function parseApiError(response: Response): Promise<string> {
    const payload = await response.json().catch(() => null);
    if (typeof payload?.message === "string") return payload.message;
    if (Array.isArray(payload?.message)) return payload.message.join(", ");
    return `Request failed with status ${response.status}`;
}

const CSV_COLUMNS: ReadonlyArray<CsvColumn<AttendeeRow>> = [
    { header: "Name", accessor: (r) => r.name ?? "" },
    { header: "Email", accessor: (r) => r.email ?? "" },
    { header: "Stellar Public Key", accessor: (r) => r.stellarPublicKey ?? "" },
    { header: "Registered At (UTC)", accessor: (r) => r.registeredAt ?? "" },
    { header: "Payment Status", accessor: (r) => r.paymentStatus ?? "" },
    { header: "Ticket ID", accessor: (r) => r.ticketId ?? "" },
];

export default function AttendeesPage({ params }: { params: { id: string } }) {
    const { id: eventId } = params;

    const [rows, setRows] = useState<AttendeeRow[]>([]);
    const [search, setSearch] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [highlightedIds, setHighlightedIds] = useState<ReadonlySet<string>>(new Set());

    // We keep the previously-seen ids in a ref so re-fetches don't lose track
    // of what was already known (useful for diffing on each poll).
    const knownIdsRef = useRef<Set<string>>(new Set());
    // First load shouldn't paint every existing row as "new".
    const isFirstLoadRef = useRef(true);
    // Avoid a stale-closure on the highlight clear timer.
    const highlightTimerRef = useRef<number | null>(null);

    const debouncedSearch = useDebounce(search, 200);

    const fetchRegistrations = useCallback(async () => {
        const token = getAccessToken();
        if (!token) {
            setError("Organizer access token not found. Please log in.");
            setIsLoading(false);
            return;
        }

        try {
            const response = await fetch(
                `${API_BASE_URL}/events/${eventId}/registrations?page=1&limit=200`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: "no-store",
                },
            );
            if (!response.ok) throw new Error(await parseApiError(response));

            const payload = (await response.json()) as ApiPaginated<ApiRegistration> | ApiRegistration[];
            const list = Array.isArray(payload) ? payload : payload.data ?? [];
            const next = list.map(normalize);

            // Compute new ids for the highlight animation (skip on first load).
            const previouslyKnown = knownIdsRef.current;
            const newIds = isFirstLoadRef.current
                ? new Set<string>()
                : new Set(next.filter((r) => !previouslyKnown.has(r.id)).map((r) => r.id));

            knownIdsRef.current = new Set(next.map((r) => r.id));
            isFirstLoadRef.current = false;

            setRows(next);
            setError(null);
            setLastUpdated(new Date());

            if (newIds.size > 0) {
                setHighlightedIds(newIds);
                if (highlightTimerRef.current !== null) {
                    window.clearTimeout(highlightTimerRef.current);
                }
                highlightTimerRef.current = window.setTimeout(() => {
                    setHighlightedIds(new Set());
                    highlightTimerRef.current = null;
                }, HIGHLIGHT_DURATION_MS);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load attendees");
        } finally {
            setIsLoading(false);
        }
    }, [eventId]);

    useEffect(() => {
        void fetchRegistrations();
        const intervalId = window.setInterval(() => void fetchRegistrations(), POLL_INTERVAL_MS);
        return () => {
            window.clearInterval(intervalId);
            if (highlightTimerRef.current !== null) {
                window.clearTimeout(highlightTimerRef.current);
            }
        };
    }, [fetchRegistrations]);

    const filteredRows = useMemo(() => {
        const needle = debouncedSearch.trim().toLowerCase();
        if (!needle) return rows;
        return rows.filter((r) => {
            return (
                (r.name ?? "").toLowerCase().includes(needle) ||
                (r.email ?? "").toLowerCase().includes(needle)
            );
        });
    }, [rows, debouncedSearch]);

    const handleExport = useCallback(() => {
        const stamp = new Date().toISOString().slice(0, 10);
        exportToCsv(`attendees-${eventId}-${stamp}.csv`, filteredRows, CSV_COLUMNS);
    }, [eventId, filteredRows]);

    return (
        <main className="min-h-screen bg-gradient-to-tr from-black via-gray-900 to-purple-950 px-4 pb-16 pt-28 text-white sm:px-8">
            <div className="mx-auto w-full max-w-7xl">
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
                        debouncedSearch
                            ? `No attendees match "${debouncedSearch}".`
                            : "No attendees have registered yet."
                    }
                />
            </div>
        </main>
    );
}
