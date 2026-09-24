'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuditLogViewer } from '@/components/AuditLogViewer';
import { useAuth } from '@/contexts/AuthContext';

export default function AuditLogPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    // Only organizers (and admins) should see audit logs.
    if (user.role !== 'organizer' && user.role !== 'admin') {
      router.replace('/');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || (user.role !== 'organizer' && user.role !== 'admin')) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Page header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-white">Audit Trail</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Review all actions taken on your events — tickets, refunds, access changes, and more.
            </p>
          </div>

          {/* Breadcrumb nav */}
          <nav className="flex items-center gap-2 text-sm text-gray-500" aria-label="Breadcrumb">
            <Link href="/organizer/dashboard" className="hover:text-gray-300 transition-colors">
              Dashboard
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-gray-300">Audit Trail</span>
          </nav>
        </div>
      </header>

      {/* Content */}
      <div className="px-6 py-6 max-w-screen-2xl mx-auto">
        <AuditLogViewer title="Event Audit Logs" />
      </div>
    </main>
  );
}
