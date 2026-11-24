"use client";

import { useState } from "react";
import { apiClient, type BatchTransferEntry } from "@/lib/api-client";
import type { Ticket } from "@/components/TicketCard";

interface BatchTransferPanelProps {
  tickets: Ticket[];
  onTransferred: (ticketIds: string[]) => void;
}

interface RowResult {
  ticketId: string;
  ok: boolean;
  message: string;
}

/**
 * Batch ticket transfer (issue #1164): select multiple owned tickets, assign
 * each one a recipient, and send them all through POST /tickets/batch-transfer
 * in one action. Partial failures are surfaced per ticket rather than as one
 * opaque error, because the backend transfers each ticket independently.
 */
export default function BatchTransferPanel({ tickets, onTransferred }: BatchTransferPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recipients, setRecipients] = useState<Record<string, string>>({});
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (ticketId: string) => {
    setResults(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  };

  const toggleAll = () => {
    setResults(null);
    setSelected((prev) => (prev.size === tickets.length ? new Set() : new Set(tickets.map((t) => t.id))));
  };

  const transferBatch = async () => {
    const selectedIds = Array.from(selected);
    if (selectedIds.length === 0) return;

    const entries: BatchTransferEntry[] = selectedIds.map((ticketId) => ({
      ticketId,
      recipientUserId: recipients[ticketId]?.trim() ?? "",
    }));

    const missing = entries.filter((e) => !e.recipientUserId);
    if (missing.length > 0) {
      setError("Every selected ticket needs a recipient user id.");
      return;
    }

    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const res = await apiClient.batchTransferTickets(entries);
      // The backend returns { transferredCount, errors? }. "errors" holds any
      // entries that could not be processed; entries not in it (up to
      // transferredCount) succeeded. Build one result row per submitted ticket.
      const rows: RowResult[] = entries.map((entry) => {
        const failed = res.errors?.find((e) => e.includes(entry.ticketId));
        return {
          ticketId: entry.ticketId,
          ok: !failed,
          message: failed ?? (res.success ? "Transferred" : "Not transferred"),
        };
      });
      setResults(rows);
      const done = rows.filter((r) => r.ok).map((r) => r.ticketId);
      onTransferred(done);
      setSelected(new Set());
      setRecipients({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch transfer failed.");
    } finally {
      setBusy(false);
    }
  };

  const allSelected = tickets.length > 0 && selected.size === tickets.length;

  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-white font-semibold">Batch transfer</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Select multiple tickets and move each to a different recipient in one action.
          </p>
        </div>
        {tickets.length > 0 && (
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        )}
      </div>

      {tickets.length === 0 ? (
        <p className="text-sm text-gray-500">No ownable tickets to transfer.</p>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="flex items-center gap-3 rounded-lg bg-gray-900/60 border border-gray-700 px-3 py-2.5"
            >
              <input
                type="checkbox"
                aria-label={`Select ${ticket.eventTitle}`}
                checked={selected.has(ticket.id)}
                onChange={() => toggle(ticket.id)}
                className="h-4 w-4 flex-shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">{ticket.eventTitle}</p>
                <p className="text-[11px] text-gray-600 font-mono truncate">{ticket.id}</p>
              </div>
              {selected.has(ticket.id) ? (
                <input
                  type="text"
                  aria-label={`Recipient for ${ticket.eventTitle}`}
                  value={recipients[ticket.id] ?? ""}
                  onChange={(e) =>
                    setRecipients((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                  }
                  placeholder="Recipient user id"
                  className="w-44 rounded-lg bg-gray-800 border border-gray-600 text-white px-2.5 py-1.5 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
              ) : (
                <span className="w-44 text-right text-xs text-gray-600">Not selected</span>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {results && results.length > 0 && (
        <div className="mt-3 rounded-lg bg-gray-900/60 border border-gray-700 divide-y divide-gray-800">
          {results.map((row) => (
            <div key={row.ticketId} className="px-3 py-2 flex items-center gap-2 text-xs">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  row.ok ? "bg-emerald-500" : "bg-red-500"
                }`}
                aria-hidden="true"
              />
              <span className="font-mono text-gray-500">{row.ticketId.slice(0, 8)}…</span>
              <span className={row.ok ? "text-emerald-400" : "text-red-400"}>{row.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end mt-4">
        <button
          type="button"
          onClick={transferBatch}
          disabled={busy || selected.size === 0}
          className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 text-sm font-medium transition-colors"
        >
          {busy ? "Transferring…" : `Transfer ${selected.size} ticket${selected.size === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}