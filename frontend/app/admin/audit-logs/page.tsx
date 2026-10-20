'use client';

import { AuditLogViewer } from '@/components/AuditLogViewer';
import AdminNav from '@/components/AdminNav';

export default function AdminAuditLogsPage() {
  return (
    <main className="min-h-screen bg-[#060609] text-white pt-24 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        <AdminNav />
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
            Activity Audit Logs
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Platform-wide audit trail of account, event, ticket, refund, and access actions.
          </p>
        </div>
        <AuditLogViewer title="Admin Audit Logs" />
      </div>
    </main>
  );
}