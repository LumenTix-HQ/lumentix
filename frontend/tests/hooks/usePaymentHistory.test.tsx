import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const apiGet = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (path: string) => apiGet(path) },
}));

import { usePaymentHistory } from '@/hooks/usePaymentHistory';

const sample = [
  { id: 'p1', eventId: 'e1', amount: 10, currency: 'XLM', status: 'CONFIRMED', createdAt: '2024-01-01', transactionHash: null },
  { id: 'p2', eventId: 'e2', amount: 5, currency: 'XLM', status: 'REFUNDED', createdAt: '2024-01-02', transactionHash: null },
];

describe('usePaymentHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads payments (happy path)', async () => {
    apiGet.mockResolvedValueOnce({ data: sample, total: 2, page: 1, limit: 20 });
    const { result } = renderHook(() => usePaymentHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.allPayments).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('filters payments by status', async () => {
    apiGet.mockResolvedValueOnce({ data: sample, total: 2, page: 1, limit: 20 });
    const { result } = renderHook(() => usePaymentHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setFilter('REFUNDED'));
    expect(result.current.payments).toHaveLength(1);
    expect(result.current.payments[0].id).toBe('p2');
  });

  it('surfaces an error when the request fails', async () => {
    apiGet.mockRejectedValueOnce(new Error('nope'));
    const { result } = renderHook(() => usePaymentHistory());
    await waitFor(() => expect(result.current.error).toBe('nope'));
  });
});
