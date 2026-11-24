import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '@/lib/api-client';

export type PaymentStatus =
  | 'CONFIRMED'
  | 'PENDING'
  | 'REFUNDED'
  | 'FAILED'
  | 'EXPIRED';

export interface PaymentRecord {
  id: string;
  eventId: string;
  eventTitle?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
  transactionHash: string | null;
}

/**
 * Backend `GET /payments/history` returns the shared paginated envelope
 * (`PaginatedResult<Payment>`), where `Payment.status` is the lowercase
 * `PaymentStatus` enum from the payments module.
 */
interface PaymentsResponse {
  data: BackendPayment[];
  total: number;
  page: number;
  lastPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface BackendPayment {
  id: string;
  eventId: string | null;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  transactionHash: string | null;
}

const DEFAULT_LIMIT = 20;

const KNOWN_STATUSES: PaymentStatus[] = [
  'CONFIRMED',
  'PENDING',
  'REFUNDED',
  'FAILED',
  'EXPIRED',
];

/** The backend uses lowercase statuses; the UI works with uppercase ones. */
function normalizeStatus(status: string | null | undefined): PaymentStatus {
  const upper = (status ?? '').toUpperCase() as PaymentStatus;
  return KNOWN_STATUSES.includes(upper) ? upper : 'PENDING';
}

function toPaymentRecord(payment: BackendPayment): PaymentRecord {
  return {
    id: payment.id,
    eventId: payment.eventId ?? '',
    amount: payment.amount,
    currency: payment.currency,
    status: normalizeStatus(payment.status),
    createdAt: payment.createdAt,
    transactionHash: payment.transactionHash,
  };
}

export function usePaymentHistory(limit: number = DEFAULT_LIMIT) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet<PaymentsResponse>(
        `/payments/history?page=${page}&limit=${limit}`,
      );
      setPayments((response.data ?? []).map(toPaymentRecord));
      setTotal(response.total ?? 0);
      setLastPage(response.lastPage ?? 1);
      setHasNextPage(Boolean(response.hasNextPage));
      setHasPreviousPage(Boolean(response.hasPreviousPage));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const filteredPayments =
    filter === 'ALL'
      ? payments
      : payments.filter((p) => p.status === filter);

  return {
    payments: filteredPayments,
    allPayments: payments,
    loading,
    error,
    filter,
    setFilter,
    page,
    setPage,
    total,
    lastPage,
    hasNextPage,
    hasPreviousPage,
    refetch: fetchPayments,
  };
}
