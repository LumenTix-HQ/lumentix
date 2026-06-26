'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('lumentix_access_token');
    if (!token) {
      router.push('/login?redirect=/admin/users');
      return;
    }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.role !== 'admin') {
        router.push('/');
        return;
      }
      setAuthorized(true);
    } catch {
      router.push('/login');
    }
  }, [router]);

  if (!authorized) return null;

  return <>{children}</>;
}
