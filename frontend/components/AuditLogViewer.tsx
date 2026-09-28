'use client';

import { useEffect, useCallback, useState } from 'react';
import type { AuditExportFormat, AuditLogFilters } from '@/hooks/useAuditLogs';
import { useAuditLogs } from '@/hooks/useAuditLogs';

// ─── Action type options ───────────────────────────────────────────────────────
//
// These have to match the values the backend actually writes into
// `AuditAction` — the audit trail is a record of what happened, so an option
// that matches nothing is worse than no option at all.

const ACTION_TYPE_OPTIONS = [
  { value: '', label: 'All actions' },

  // Payments
  { value: 'PAYMENT_INTENT_CREATED', label: 'Payment Intent Created' },
  { value: 'PAYMENT_CONFIRMED', label: 'Payment Confirmed' },
  { value: 'PAYMENT_FAILED', label: 'Payment Failed' },
  { value: 'PAYMENT_EXPIRED', label: 'Payment Expired' },

  // Refunds
  { value: 'REFUND_REQUESTED', label: 'Refund Requested' },
  { value: 'REFUND_APPROVED', label: 'Refund Approved' },
  { value: 'REFUND_REJECTED', label: 'Refund Rejected' },

  // Escrow
  { value: 'ESCROW_CREATED', label: 'Escrow Created' },
  { value: 'ESCROW_RELEASED', label: 'Escrow Released' },
  { value: 'ESCROW_MERGED', label: 'Escrow Merged' },

  // Events
  { value: 'EVENT_PUBLISHED', label: 'Event Published' },
  { value: 'EVENT_CANCELLED', label: 'Event Cancelled' },
  { value: 'EVENT_COMPLETED', label: 'Event Completed' },
  { value: 'MASS_REFUND_EXECUTED_ON_CHAIN', label: 'Mass Refund Executed' },

  // Ticket gifting
  { value: 'TICKET_GIFT_WRAPPED', label: 'Ticket Gift Wrapped' },
  { value: 'TICKET_GIFT_SCHEDULED', label: 'Ticket Gift Scheduled' },
  { value: 'TICKET_GIFT_RESCHEDULED', label: 'Ticket Gift Rescheduled' },
  { value: 'TICKET_GIFT_DELIVERED', label: 'Ticket Gift Delivered' },
  { value: 'TICKET_GIFT_UNWRAPPED', label: 'Ticket Gift Unwrapped' },
  { value: 'TICKET_GIFT_CANCELLED', label: 'Ticket Gift Cancelled' },

  // Resale marketplace
  { value: 'RESALE_LISTED', label: 'Resale Listed' },
  { value: 'RESALE_BOUGHT', label: 'Resale Bought' },
  { value: 'RESALE_CANCELLED', label: 'Resale Cancelled' },

  // Venue capacity
  { value: 'IOT_SENSOR_REGISTERED', label: 'IoT Sensor Registered' },
  { value: 'CAPACITY_ALERT_FIRED', label: 'Capacity Alert Fired' },
  { value: 'CAPACITY_LIMIT_UPDATED', label: 'Capacity Limit Updated' },

  // Multi-signature payout
  { value: 'PAYOUT_INITIATED', label: 'Payout Initiated' },
  { value: 'PAYOUT_APPROVED', label: 'Payout Approved' },
  { value: 'PAYOUT_EXECUTED', label: 'Payout Executed' },
  { value: 'PAYOUT_FAILED', label: 'Payout Failed' },

  // Reviews
  { value: 'REVIEW_SUBMITTED', label: 'Review Submitted' },
  { value: 'REVIEW_VERIFIED', label: 'Review Verified' },
  { value: 'REVIEW_REJECTED', label: 'Review Rejected' },
];

// ─── Sub-components ────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-800">
      {[140, 120, 90, 90, 180, 100].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className="h-3.5 rounded bg-gray-700 animate-pulse"
            style={{ width: `${w}px`, maxWidth: '100%' }}
          />
        </td>
      ))}
    </tr>
  );
}

function ActionBadge({ action }: { action: string }) {
  // Actions are UPPER_SNAKE_CASE, so colour by the leading words rather than
  // splitting on a dot. Unknown actions fall through to the neutral style
  // instead of losing their badge entirely.
  const colorMap: Array<[RegExp, string]> = [
    [/^TICKET_GIFT_/, 'bg-rose-900/50 text-rose-300 border-rose-700'],
    [/^PAYMENT_/, 'bg-green-900/50 text-green-300 border-green-700'],
    [/^REFUND_/, 'bg-amber-900/50 text-amber-300 border-amber-700'],
    [/^ESCROW_/, 'bg-teal-900/50 text-teal-300 border-teal-700'],
    [/^PAYOUT_/, 'bg-teal-900/50 text-teal-300 border-teal-700'],
    [/^EVENT_|^MASS_REFUND_/, 'bg-blue-900/50 text-blue-300 border-blue-700'],
    [/^RESALE_/, 'bg-purple-900/50 text-purple-300 border-purple-700'],
    [/^CAPACITY_|^IOT_/, 'bg-cyan-900/50 text-cyan-300 border-cyan-700'],
    [/^AGE_/, 'bg-indigo-900/50 text-indigo-300 border-indigo-700'],
    [/^REVIEW_/, 'bg-pink-900/50 text-pink-300 border-pink-700'],
  ];
  const cls =
    colorMap.find(([pattern]) => pattern.test(action))?.[1] ??
    'bg-gray-700/50 text-gray-300 border-gray-600';
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${cls}`}>
      {action}
    </span>
  );
}

function MetadataSnippet({ metadata }: { metadata: Record<string, unknown> }) {
  const raw = JSON.stringify(metadata);
  const snippet = raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;
  return (
    <span className="font-mono text-xs text-gray-500" title={raw}>
      {snippet}
    </span>
  );
}

function EmptyState() {
  return (
    <tr>
      <td colSpan={6} className="py-16 text-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-10 h-10 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0120 9.414V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-gray-500">No audit logs found matching your filters.</p>
        </div>
      </td>
    </tr>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface AuditLogViewerProps {
  /** Pre-filter by a specific resource (e.g. an event ID). Optional. */
  resourceId?: string;
  /** Page title shown in the viewer header. */
  title?: string;
}

// ─── Main component ────────────────────────────────────────────────────────────

export function AuditLogViewer({ resourceId, title = 'Audit Trail' }: AuditLogViewerProps) {
  const {
    logs,
    total,
    totalPages,
    currentPage,
    isLoading,
    error,
    filters,
    setFilters,
    queryAuditLogs,
    exportAuditTrail,
  } = useAuditLogs({ resourceId, page: 1, limit: 25 });

  // The search box is driven locally and pushed to the server on submit. Typing
  // a query fires a request per keystroke otherwise, which is both slow and
  // noisy in the audit log of an admin session.
  const [searchInput, setSearchInput] = useState('');
  const [exportFormat, setExportFormat] = useState<AuditExportFormat>('csv');

  // Initial load
  useEffect(() => {
    queryAuditLogs({ resourceId, page: 1, limit: 25 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleFilterChange = useCallback(
    (patch: Partial<AuditLogFilters>) => {
      const next: AuditLogFilters = { ...filters, ...patch, page: 1 };
      setFilters(next);
      queryAuditLogs(next);
    },
    [filters, setFilters, queryAuditLogs],
  );

  const handlePageChange = useCallback(
    (page: number) => {
      const next: AuditLogFilters = { ...filters, page };
      setFilters(next);
      queryAuditLogs(next);
    },
    [filters, setFilters, queryAuditLogs],
  );

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const next: AuditLogFilters = { ...filters, search: searchInput || undefined, page: 1 };
      setFilters(next);
      queryAuditLogs(next);
    },
    [filters, searchInput, setFilters, queryAuditLogs],
  );

  const handleSearchClear = useCallback(() => {
    setSearchInput('');
    const next: AuditLogFilters = { ...filters, search: undefined, page: 1 };
    setFilters(next);
    queryAuditLogs(next);
  }, [filters, setFilters, queryAuditLogs]);

  const handleExport = useCallback(
    (format: AuditExportFormat) => {
      exportAuditTrail(format);
    },
    [exportAuditTrail],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {!isLoading && total > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              {total.toLocaleString()} record{total !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="audit-export-format" className="sr-only">
            Export format
          </label>
          <select
            id="audit-export-format"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as AuditExportFormat)}
            className="rounded-lg border border-gray-600 bg-gray-800 text-gray-300 text-sm px-2 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>

          <button
            type="button"
            onClick={() => handleExport(exportFormat)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 hover:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export {exportFormat.toUpperCase()}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-4">
        <form onSubmit={handleSearchSubmit} className="mb-4 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
            <label htmlFor="audit-search" className="text-xs font-medium text-gray-400">
              Search
            </label>
            <input
              id="audit-search"
              type="search"
              placeholder="Search actions, user IDs, resource IDs, metadata…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="rounded-lg border border-gray-600 bg-gray-900 text-white text-sm px-3 py-2 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            Search
          </button>
          {(searchInput || filters.search) && (
            <button
              type="button"
              onClick={handleSearchClear}
              className="rounded-lg border border-gray-600 bg-gray-900 hover:bg-gray-700 text-gray-400 hover:text-white text-sm px-3 py-2 transition-colors"
            >
              Clear
            </button>
          )}
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Action type */}
          <div className="flex flex-col gap-1">
            <label htmlFor="audit-action-filter" className="text-xs font-medium text-gray-400">
              Action type
            </label>
            <select
              id="audit-action-filter"
              value={filters.action ?? ''}
              onChange={(e) => handleFilterChange({ action: e.target.value || undefined })}
              className="rounded-lg border border-gray-600 bg-gray-900 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {ACTION_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* User ID search */}
          <div className="flex flex-col gap-1">
            <label htmlFor="audit-userid-filter" className="text-xs font-medium text-gray-400">
              User ID
            </label>
            <input
              id="audit-userid-filter"
              type="text"
              placeholder="Search by user ID…"
              value={filters.userId ?? ''}
              onChange={(e) => handleFilterChange({ userId: e.target.value || undefined })}
              className="rounded-lg border border-gray-600 bg-gray-900 text-white text-sm px-3 py-2 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Resource ID search */}
          <div className="flex flex-col gap-1">
            <label htmlFor="audit-resourceid-filter" className="text-xs font-medium text-gray-400">
              Resource ID
            </label>
            <input
              id="audit-resourceid-filter"
              type="text"
              placeholder="Search by resource ID…"
              value={filters.resourceId ?? ''}
              onChange={(e) => handleFilterChange({ resourceId: e.target.value || undefined })}
              className="rounded-lg border border-gray-600 bg-gray-900 text-white text-sm px-3 py-2 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Date range — from */}
          <div className="flex flex-col gap-1">
            <label htmlFor="audit-from-date" className="text-xs font-medium text-gray-400">
              From date
            </label>
            <input
              id="audit-from-date"
              type="date"
              value={filters.fromDate ?? ''}
              onChange={(e) => handleFilterChange({ fromDate: e.target.value || undefined })}
              className="rounded-lg border border-gray-600 bg-gray-900 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Date range — to (spans 1 col, aligned with grid) */}
          <div className="flex flex-col gap-1">
            <label htmlFor="audit-to-date" className="text-xs font-medium text-gray-400">
              To date
            </label>
            <input
              id="audit-to-date"
              type="date"
              value={filters.toDate ?? ''}
              onChange={(e) => handleFilterChange({ toDate: e.target.value || undefined })}
              className="rounded-lg border border-gray-600 bg-gray-900 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Clear filters */}
          <div className="flex items-end sm:col-span-1">
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                const cleared: AuditLogFilters = { resourceId, page: 1, limit: filters.limit };
                setFilters(cleared);
                queryAuditLogs(cleared);
              }}
              className="w-full rounded-lg border border-gray-600 bg-gray-900 hover:bg-gray-700 text-gray-400 hover:text-white text-sm px-3 py-2 transition-colors"
            >
              Clear filters
            </button>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-700 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-800/80">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  User ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Resource ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Metadata
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  Date / Time
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-900">
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : logs.length === 0
                ? <EmptyState />
                : logs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-gray-800/60 transition-colors"
                    >
                      {/* ID */}
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 max-w-[120px] truncate" title={log.id}>
                        {log.id}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3">
                        <ActionBadge action={log.action} />
                      </td>

                      {/* User ID */}
                      <td className="px-4 py-3 font-mono text-xs text-gray-300 max-w-[100px] truncate" title={log.userId}>
                        {log.userId}
                      </td>

                      {/* Resource ID */}
                      <td className="px-4 py-3 font-mono text-xs text-gray-300 max-w-[100px] truncate" title={log.resourceId}>
                        {log.resourceId}
                      </td>

                      {/* Metadata */}
                      <td className="px-4 py-3 max-w-[200px]">
                        <MetadataSnippet metadata={log.metadata ?? {}} />
                      </td>

                      {/* Created at */}
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-gray-500">
            Page {currentPage} of {totalPages} &mdash; {total.toLocaleString()} total records
          </p>

          <div className="flex items-center gap-1">
            {/* First */}
            <button
              type="button"
              onClick={() => handlePageChange(1)}
              disabled={currentPage === 1}
              className="rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1.5 text-xs text-gray-300 hover:text-white transition-colors"
              aria-label="First page"
            >
              «
            </button>

            {/* Prev */}
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 text-xs text-gray-300 hover:text-white transition-colors"
              aria-label="Previous page"
            >
              ‹ Prev
            </button>

            {/* Page numbers */}
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              // Show pages around current
              const half = 3;
              let start = Math.max(1, currentPage - half);
              const end = Math.min(totalPages, start + 6);
              start = Math.max(1, end - 6);
              return start + i;
            })
              .filter((p) => p >= 1 && p <= totalPages)
              .map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePageChange(p)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    p === currentPage
                      ? 'border-indigo-500 bg-indigo-600 text-white'
                      : 'border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white'
                  }`}
                  aria-current={p === currentPage ? 'page' : undefined}
                >
                  {p}
                </button>
              ))}

            {/* Next */}
            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 text-xs text-gray-300 hover:text-white transition-colors"
              aria-label="Next page"
            >
              Next ›
            </button>

            {/* Last */}
            <button
              type="button"
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1.5 text-xs text-gray-300 hover:text-white transition-colors"
              aria-label="Last page"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
