import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

export interface PaymentRecord {
  id: string;
  eventId: string;
  eventTitle?: string;
  amount: number;
  currency: string;
  status: 'CONFIRMED' | 'PENDING' | 'REFUNDED' | 'FAILED' | 'EXPIRED';
  createdAt: string;
  transactionHash: string | null;
}

interface PaymentsResponse {
  data: PaymentRecord[];
  total: number;
  page: number;
  limit: number;
}

export function usePaymentHistory() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('ALL');

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<PaymentsResponse>('/payments/my-payments');
      setPayments(response.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, []);

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
    refetch: fetchPayments,
  };
}
