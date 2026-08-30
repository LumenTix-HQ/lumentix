'use client';

import { useState, useCallback, useRef } from 'react';
import { getAccessToken } from '@/lib/auth/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const PROXY_BASE = '/api/proxy';

export interface AuditLog {
  id: string;
  action: string;
  userId: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogFilters {
  action?: string;
  userId?: string;
  resourceId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export interface AuditLogPage {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UseAuditLogsResult {
  logs: AuditLog[];
  total: number;
  totalPages: number;
  currentPage: number;
  isLoading: boolean;
  error: string | null;
  filters: AuditLogFilters;
  setFilters: (filters: AuditLogFilters) => void;
  queryAuditLogs: (filters?: AuditLogFilters) => Promise<void>;
  filterByActionType: (actionType: string) => Promise<void>;
  exportAuditTrail: (filters?: AuditLogFilters) => Promise<void>;
  refresh: () => void;
}

function buildQueryString(filters: AuditLogFilters): string {
  const params: Record<string, string> = {};

  if (filters.action) params['action'] = filters.action;
  if (filters.userId) params['userId'] = filters.userId;
  if (filters.resourceId) params['resourceId'] = filters.resourceId;
  if (filters.fromDate) params['fromDate'] = filters.fromDate;
  if (filters.toDate) params['toDate'] = filters.toDate;
  if (filters.page !== undefined) params['page'] = String(filters.page);
  if (filters.limit !== undefined) params['limit'] = String(filters.limit);

  const qs = new URLSearchParams(params).toString();
  return qs ? `?${qs}` : '';
}

async function parseResponseError(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null);
  if (typeof payload?.message === 'string') return payload.message;
  if (Array.isArray(payload?.message)) return payload.message.join(', ');
  return `Request failed with status ${response.status}`;
}

export function useAuditLogs(initialFilters: AuditLogFilters = {}): UseAuditLogsResult {
  const defaultFilters: AuditLogFilters = { page: 1, limit: 25, ...initialFilters };

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<AuditLogFilters>(defaultFilters);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * query_audit_logs — fetches audit logs with the given filters.
   * Updates internal state (logs, pagination, error, loading).
   */
  const queryAuditLogs = useCallback(async (overrideFilters?: AuditLogFilters) => {
    const active = overrideFilters ?? filters;

    // Cancel any in-flight request.
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    const token = getAccessToken();
    const qs = buildQueryString(active);

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${PROXY_BASE}/admin/audit${qs}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(await parseResponseError(res));
      }

      const payload: AuditLogPage | AuditLog[] = await res.json();

      if (Array.isArray(payload)) {
        setLogs(payload);
        setTotal(payload.length);
        setTotalPages(1);
        setCurrentPage(1);
      } else {
        setLogs(payload.data ?? []);
        setTotal(payload.total ?? 0);
        setTotalPages(payload.totalPages ?? 1);
        setCurrentPage(payload.page ?? 1);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  /**
   * filter_by_action_type — convenience wrapper that sets an action filter
   * and re-fetches, resetting pagination to page 1.
   */
  const filterByActionType = useCallback(async (actionType: string) => {
    const updated: AuditLogFilters = { ...filters, action: actionType || undefined, page: 1 };
    setFiltersState(updated);
    await queryAuditLogs(updated);
  }, [filters, queryAuditLogs]);

  /**
   * export_audit_trail — triggers a CSV download from the export endpoint.
   * Streams the response as a Blob and initiates a browser download.
   */
  const exportAuditTrail = useCallback(async (overrideFilters?: AuditLogFilters) => {
    const active = overrideFilters ?? filters;
    // Remove pagination — export should cover all matching records.
    const exportFilters: AuditLogFilters = { ...active };
    delete exportFilters.page;
    delete exportFilters.limit;

    const token = getAccessToken();
    const qs = buildQueryString(exportFilters);

    try {
      const res = await fetch(`${PROXY_BASE}/admin/audit/export${qs}`, {
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(await parseResponseError(res));
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `audit-trail-${stamp}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      // Surface export errors via the shared error state so the UI can respond.
      setError(err instanceof Error ? err.message : 'Failed to export audit trail');
    }
  }, [filters]);

  const setFilters = useCallback((next: AuditLogFilters) => {
    setFiltersState(next);
  }, []);

  const refresh = useCallback(() => {
    queryAuditLogs(filters);
  }, [queryAuditLogs, filters]);

  return {
    logs,
    total,
    totalPages,
    currentPage,
    isLoading,
    error,
    filters,
    setFilters,
    queryAuditLogs,
    filterByActionType,
    exportAuditTrail,
    refresh,
  };
}
