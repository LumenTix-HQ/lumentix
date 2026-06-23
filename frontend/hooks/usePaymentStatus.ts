import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export default function usePaymentStatus(paymentId: string | null) {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!paymentId) return;

    const getToken = () =>
      typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

    const poll = async () => {
      try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/payments/${paymentId}/status`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setStatus(data.status);
          if (data.status === 'CONFIRMED' || data.status === 'FAILED') {
            clearInterval(interval);
          }
        }
      } catch {
        // ignore transient network errors
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [paymentId]);

  return { status };
}
