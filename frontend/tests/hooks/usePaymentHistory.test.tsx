import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const mockApiGet = vi.fn();
// Mock the real exported function so a call to a non-existent method (e.g. the
// old `apiClient.get`) fails the test instead of silently passing.
vi.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}));

import { usePaymentHistory } from '@/hooks/usePaymentHistory';

// Backend `Payment.status` values are lowercase.
const sample = [
  { id: 'p1', eventId: 'e1', amount: 10, currency: 'XLM', status: 'confirmed', createdAt: '2024-01-01', transactionHash: null },
  { id: 'p2', eventId: 'e2', amount: 5, currency: 'XLM', status: 'refunded', createdAt: '2024-01-02', transactionHash: null },
];

const envelope = {
  data: sample,
  total: 2,
  page: 1,
  lastPage: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

describe('usePaymentHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads payments from the history endpoint', async () => {
    mockApiGet.mockResolvedValueOnce(envelope);
    const { result } = renderHook(() => usePaymentHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockApiGet).toHaveBeenCalledWith('/payments/history?page=1&limit=20');
    expect(result.current.allPayments).toHaveLength(2);
    expect(result.current.error).toBeNull();
    expect(result.current.total).toBe(2);
  });

  it('normalizes the backend lowercase status for the UI', async () => {
    mockApiGet.mockResolvedValueOnce(envelope);
    const { result } = renderHook(() => usePaymentHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.allPayments[0].status).toBe('CONFIRMED');
    expect(result.current.allPayments[1].status).toBe('REFUNDED');
  });

  it('filters payments by status', async () => {
    mockApiGet.mockResolvedValueOnce(envelope);
    const { result } = renderHook(() => usePaymentHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setFilter('REFUNDED'));
    expect(result.current.payments).toHaveLength(1);
    expect(result.current.payments[0].id).toBe('p2');
  });

  it('requests the next page when the page changes', async () => {
    mockApiGet.mockResolvedValue({
      ...envelope,
      total: 40,
      lastPage: 2,
      hasNextPage: true,
    });
    const { result } = renderHook(() => usePaymentHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(2));
    await waitFor(() =>
      expect(mockApiGet).toHaveBeenLastCalledWith('/payments/history?page=2&limit=20'),
    );
  });

  it('surfaces an error when the request fails', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('nope'));
    const { result } = renderHook(() => usePaymentHistory());
    await waitFor(() => expect(result.current.error).toBe('nope'));
  });
});
