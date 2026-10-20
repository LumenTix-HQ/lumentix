'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.push('/login?redirect=/admin/users');
      return;
    }
    if (user.role !== 'admin') {
      router.push('/');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || user.role !== 'admin') return null;

  return <>{children}</>;
}
