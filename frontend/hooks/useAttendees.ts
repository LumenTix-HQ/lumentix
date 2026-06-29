'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAccessToken } from '@/lib/auth/auth';
import type { AttendeeRow } from '@/components/AttendeeTable';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const POLL_INTERVAL_MS = 30_000;
const HIGHLIGHT_DURATION_MS = 3_000;

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
  const composed = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
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
  if (typeof payload?.message === 'string') return payload.message;
  if (Array.isArray(payload?.message)) return payload.message.join(', ');
  return `Request failed with status ${response.status}`;
}

interface UseAttendeesResult {
  rows: AttendeeRow[];
  filteredRows: AttendeeRow[];
  search: string;
  setSearch: (value: string) => void;
  highlightedIds: ReadonlySet<string>;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  handleExport: () => void;
  refresh: () => void;
}

export function useAttendees(eventId: string): UseAttendeesResult {
  const [rows, setRows] = useState<AttendeeRow[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<ReadonlySet<string>>(new Set());

  const knownIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);
  const highlightTimerRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, 200);
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [search]);

  const fetchRegistrations = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setError('Organizer access token not found. Please log in.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/events/${eventId}/registrations?page=1&limit=200`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        },
      );
      if (!response.ok) throw new Error(await parseApiError(response));

      const payload = (await response.json()) as ApiPaginated<ApiRegistration> | ApiRegistration[];
      const list = Array.isArray(payload) ? payload : payload.data ?? [];
      const next = list.map(normalize);

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
      setError(err instanceof Error ? err.message : 'Failed to load attendees');
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchRegistrations();
    const intervalId = window.setInterval(() => fetchRegistrations(), POLL_INTERVAL_MS);
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
        (r.name ?? '').toLowerCase().includes(needle) ||
        (r.email ?? '').toLowerCase().includes(needle)
      );
    });
  }, [rows, debouncedSearch]);

  const handleExport = useCallback(() => {
    const columns = [
      { header: 'Name', accessor: (r: AttendeeRow) => r.name ?? '' },
      { header: 'Email', accessor: (r: AttendeeRow) => r.email ?? '' },
      { header: 'Stellar Public Key', accessor: (r: AttendeeRow) => r.stellarPublicKey ?? '' },
      { header: 'Registered At (UTC)', accessor: (r: AttendeeRow) => r.registeredAt ?? '' },
      { header: 'Payment Status', accessor: (r: AttendeeRow) => r.paymentStatus ?? '' },
      { header: 'Ticket ID', accessor: (r: AttendeeRow) => r.ticketId ?? '' },
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    import('@/lib/utils/csv-export').then(({ exportToCsv }) => {
      exportToCsv(`attendees-${eventId}-${stamp}.csv`, filteredRows, columns);
    });
  }, [eventId, filteredRows]);

  return {
    rows,
    filteredRows,
    search,
    setSearch,
    highlightedIds,
    isLoading,
    error,
    lastUpdated,
    handleExport,
    refresh: fetchRegistrations,
  };
}
