'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { decodeJwtPayload } from '@/lib/auth/token';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('lumentix_access_token');
    if (!token) {
      router.push('/login?redirect=/admin/users');
      return;
    }
    const payload = decodeJwtPayload(token);
    if (!payload) {
      router.push('/login');
      return;
    }
    if (payload.role !== 'admin') {
      router.push('/');
      return;
    }
    setAuthorized(true);
  }, [router]);

  if (!authorized) return null;

  return <>{children}</>;
}
