import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '@/hooks/useDebounce';

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('useDebounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('a', 300));
    expect(result.current).toBe('a');
  });

  it('only updates after the delay elapses', () => {
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 300), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'b' });
    // Not yet updated
    expect(result.current).toBe('a');
    advance(299);
    expect(result.current).toBe('a');
    advance(1);
    expect(result.current).toBe('b');
  });

  it('resets the timer on rapid changes (only last value wins)', () => {
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 300), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'b' });
    advance(200);
    rerender({ v: 'c' });
    advance(200);
    expect(result.current).toBe('a');
    advance(100);
    expect(result.current).toBe('c');
  });
});
