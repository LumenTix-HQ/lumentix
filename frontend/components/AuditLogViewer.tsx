'use client';

import { useEffect, useCallback } from 'react';
import type { AuditLogFilters } from '@/hooks/useAuditLogs';
import { useAuditLogs } from '@/hooks/useAuditLogs';

// ─── Action type options ───────────────────────────────────────────────────────

const ACTION_TYPE_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'ticket.created', label: 'Ticket Created' },
  { value: 'ticket.updated', label: 'Ticket Updated' },
  { value: 'ticket.cancelled', label: 'Ticket Cancelled' },
  { value: 'ticket.transferred', label: 'Ticket Transferred' },
  { value: 'refund.initiated', label: 'Refund Initiated' },
  { value: 'refund.completed', label: 'Refund Completed' },
  { value: 'access.granted', label: 'Access Granted' },
  { value: 'access.revoked', label: 'Access Revoked' },
  { value: 'event.created', label: 'Event Created' },
  { value: 'event.updated', label: 'Event Updated' },
  { value: 'event.cancelled', label: 'Event Cancelled' },
  { value: 'payment.confirmed', label: 'Payment Confirmed' },
  { value: 'payment.failed', label: 'Payment Failed' },
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
  const [ns] = action.split('.');
  const colorMap: Record<string, string> = {
    ticket: 'bg-indigo-900/50 text-indigo-300 border-indigo-700',
    refund: 'bg-amber-900/50 text-amber-300 border-amber-700',
    access: 'bg-purple-900/50 text-purple-300 border-purple-700',
    event: 'bg-blue-900/50 text-blue-300 border-blue-700',
    payment: 'bg-green-900/50 text-green-300 border-green-700',
  };
  const cls = colorMap[ns] ?? 'bg-gray-700/50 text-gray-300 border-gray-600';
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

  const handleExport = useCallback(() => {
    exportAuditTrail(filters);
  }, [exportAuditTrail, filters]);

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

        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 hover:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-4">
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
