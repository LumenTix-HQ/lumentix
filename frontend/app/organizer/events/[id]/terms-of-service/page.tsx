"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { TermsOfServiceManager } from "@/components/TermsOfServiceManager";

export default function OrganizerTermsOfServicePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [token, setToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.push(`/login?redirect=/organizer/events/${id}/terms-of-service`);
      return;
    }
    const t = window.localStorage.getItem("lumentix_access_token") ?? undefined;
    setToken(t);
  }, [user, isLoading, id, router]);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Link href="/organizer/dashboard" className="hover:text-purple-400 transition-colors">
            Organizer Dashboard
          </Link>
          <span>/</span>
          <Link href={`/events/${id}`} className="hover:text-purple-400 transition-colors">
            Event {id}
          </Link>
          <span>/</span>
          <span className="text-slate-200">Custom Terms of Service</span>
        </div>

        <TermsOfServiceManager eventId={id} token={token} />
      </div>
    </div>
  );
}
