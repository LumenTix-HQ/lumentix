import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

const DEFAULT_BASE_DELAY_MS = 3000;
const DEFAULT_MAX_DELAY_MS = 30000;
const DEFAULT_MAX_ATTEMPTS = 10;

const TERMINAL_STATUSES = new Set(['CONFIRMED', 'FAILED']);

export interface UsePaymentStatusOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Exponential backoff delay for a given attempt (0-indexed), capped at maxDelay.
 * e.g. 3s, 6s, 12s, 24s, 30s, 30s, …
 */
export function getBackoffDelay(
  attempt: number,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  maxDelayMs = DEFAULT_MAX_DELAY_MS,
): number {
  return Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
}

export default function usePaymentStatus(
  paymentId: string | null,
  options: UsePaymentStatusOptions = {},
) {
  const {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
  } = options;

  const [status, setStatus] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!paymentId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    setTimedOut(false);
    setIsPolling(true);

    const getToken = () =>
      typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

    const scheduleNext = () => {
      if (cancelled) return;
      // Stop polling once we've exhausted the attempt budget; surface a
      // "still processing" fallback instead of polling forever.
      if (attempt >= maxAttempts) {
        setIsPolling(false);
        setTimedOut(true);
        return;
      }
      const delay = getBackoffDelay(attempt, baseDelayMs, maxDelayMs);
      attempt += 1;
      timer = setTimeout(tick, delay);
    };

    const tick = async () => {
      if (cancelled) return;
      try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/payments/${paymentId}/status`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          setStatus(data.status);
          if (TERMINAL_STATUSES.has(data.status)) {
            setIsPolling(false);
            return;
          }
        }
      } catch {
        // ignore transient network errors; the backoff will retry
      }
      scheduleNext();
    };

    // Poll immediately, then back off exponentially.
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [paymentId, maxAttempts, baseDelayMs, maxDelayMs]);

  return { status, isPolling, timedOut };
}
