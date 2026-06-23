"use client";

import { useMemo } from "react";

export type AttendeePaymentStatus =
    | "paid"
    | "pending"
    | "failed"
    | "refunded"
    | "free"
    | string;

/**
 * Attendee row shape consumed by the table. The backend's organizer
 * registration endpoint is expected to enrich the raw `Registration` entity
 * with the user's profile fields, so all of these except `id` are optional
 * and the table renders graceful fallbacks when fields are missing.
 */
export interface AttendeeRow {
    id: string;
    name?: string | null;
    email?: string | null;
    stellarPublicKey?: string | null;
    /** ISO 8601 timestamp. */
    registeredAt?: string | null;
    paymentStatus?: AttendeePaymentStatus | null;
    ticketId?: string | null;
}

interface AttendeeTableProps {
    rows: ReadonlyArray<AttendeeRow>;
    /** Set of registration ids that should briefly flash on render. */
    highlightedIds?: ReadonlySet<string>;
    /** Optional empty-state message. */
    emptyMessage?: string;
}

const COLUMN_HEADERS = [
    "Name",
    "Email",
    "Stellar Public Key",
    "Registered",
    "Payment",
    "Ticket",
] as const;

const PAYMENT_STATUS_STYLES: Record<string, string> = {
    paid: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    free: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    failed: "bg-red-500/15 text-red-300 border-red-500/30",
    refunded: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

/** Renders a Stellar G… key as `GABC…1234` (first 6, last 4). */
export function truncateStellarKey(key: string | null | undefined): string {
    if (!key) return "—";
    const trimmed = key.trim();
    if (trimmed.length <= 12) return trimmed;
    return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

function formatRegisteredAt(iso: string | null | undefined): string {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString();
}

function paymentStatusBadge(status: AttendeePaymentStatus | null | undefined) {
    const key = (status ?? "").toString().toLowerCase();
    const cls = PAYMENT_STATUS_STYLES[key] ?? "bg-slate-500/15 text-slate-300 border-slate-500/30";
    const label = status ? String(status) : "unknown";
    return (
        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${cls}`}>
            {label}
        </span>
    );
}

export default function AttendeeTable({
    rows,
    highlightedIds,
    emptyMessage = "No attendees registered yet.",
}: AttendeeTableProps) {
    const highlights = highlightedIds ?? new Set<string>();
    const hasRows = rows.length > 0;

    // Memoise the rendered tbody so re-renders triggered by polling don't
    // restart unrelated highlight animations.
    const body = useMemo(
        () =>
            rows.map((row) => {
                const isNew = highlights.has(row.id);
                return (
                    <tr
                        key={row.id}
                        data-attendee-id={row.id}
                        className={`text-slate-200 transition-colors ${isNew ? "animate-row-highlight" : ""}`}
                    >
                        <td className="px-4 py-3 text-sm">{row.name?.trim() || "—"}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                            {row.email ? (
                                <a href={`mailto:${row.email}`} className="hover:text-purple-300">
                                    {row.email}
                                </a>
                            ) : (
                                "—"
                            )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                            <span title={row.stellarPublicKey ?? ""} className="font-mono text-slate-300">
                                {truncateStellarKey(row.stellarPublicKey)}
                            </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">{formatRegisteredAt(row.registeredAt)}</td>
                        <td className="px-4 py-3">{paymentStatusBadge(row.paymentStatus)}</td>
                        <td className="px-4 py-3 text-xs">
                            <span title={row.ticketId ?? ""} className="font-mono text-slate-400">
                                {row.ticketId ? truncateStellarKey(row.ticketId) : "—"}
                            </span>
                        </td>
                    </tr>
                );
            }),
        [rows, highlights],
    );

    return (
        <div className="overflow-x-auto rounded-3xl border border-white/10 bg-slate-950/70">
            <table className="min-w-full divide-y divide-white/10 text-left">
                <caption className="sr-only">Event attendees</caption>
                <thead className="bg-white/5">
                    <tr>
                        {COLUMN_HEADERS.map((label) => (
                            <th
                                key={label}
                                scope="col"
                                className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400"
                            >
                                {label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {hasRows ? body : (
                        <tr>
                            <td colSpan={COLUMN_HEADERS.length} className="px-4 py-10 text-center text-sm text-slate-400">
                                {emptyMessage}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
