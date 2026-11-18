'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { hasRole, ROLES } from '@/lib/auth/roles';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.push('/login?redirect=/admin/users');
      return;
    }
    if (!hasRole(user.role, ROLES.ADMIN)) {
      router.push('/');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || !hasRole(user.role, ROLES.ADMIN)) return null;

  return <>{children}</>;
}
