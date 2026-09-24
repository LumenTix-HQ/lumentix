"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useKioskScanner } from "@/hooks/useKioskScanner";
import { ScanTarget } from "@/components/kiosk/ScanTarget";
import { ScanResultDisplay } from "@/components/kiosk/ScanResultDisplay";

/**
 * Analytics #1005 — full-screen check-in kiosk for gate staff tablets.
 *
 * Launching this page (navigating here) is `launch_kiosk_mode`; the scan
 * result is shown via `ScanResultDisplay` (`display_scan_result`), which
 * also renders the attendee photo placeholder (`show_attendee_photo`).
 */
export default function KioskPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { result, isSubmitting, inputRef, focusInput, submitScan, dismissResult } =
    useKioskScanner();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "organizer" && user.role !== "admin") {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || (user.role !== "organizer" && user.role !== "admin")) {
    return null;
  }

  return (
    <main
      className="min-h-screen bg-gray-950 px-4 py-8 text-white"
      onClick={() => {
        if (!result) focusInput();
      }}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-300">Gate Check-In Kiosk</h1>
            <p className="text-xs text-gray-500">Event {params.id}</p>
          </div>
          <Link
            href={`/organizer/events/${params.id}/attendees`}
            className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-gray-300 transition hover:bg-white/10"
          >
            Exit kiosk mode
          </Link>
        </div>

        {result ? (
          <ScanResultDisplay result={result} onDismiss={dismissResult} />
        ) : (
          <ScanTarget inputRef={inputRef} isSubmitting={isSubmitting} onSubmit={submitScan} />
        )}
      </div>
    </main>
  );
}
