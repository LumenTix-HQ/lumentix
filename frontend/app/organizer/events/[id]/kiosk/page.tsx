"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useKioskScanner } from "@/hooks/useKioskScanner";
import { ScanTarget } from "@/components/kiosk/ScanTarget";
import { ScanResultDisplay } from "@/components/kiosk/ScanResultDisplay";

export default function KioskPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { result, isSubmitting, inputRef, focusInput, submitScan, dismissResult } =
    useKioskScanner(params.id);
  const [fullscreenMessage, setFullscreenMessage] = useState("");

  // eslint-disable-next-line @typescript-eslint/naming-convention -- Public function name specified by the issue.
  async function launch_kiosk_mode() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      setFullscreenMessage("");
    } catch { setFullscreenMessage("Full-screen is unavailable. The kiosk is ready in this tab."); }
  }

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
      className="fixed inset-0 z-50 min-h-dvh overflow-y-auto bg-gray-950 px-4 py-8 text-white"
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
          <button type="button" onClick={launch_kiosk_mode} className="min-h-12 rounded-xl border border-white/30 px-4">Enter full-screen</button>
          <Link
            onClick={() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); }}
            href={`/organizer/events/${params.id}/attendees`}
            className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-gray-300 transition hover:bg-white/10"
          >
            Exit kiosk mode
          </Link>
        </div>

        {fullscreenMessage && <p role="status">{fullscreenMessage}</p>}
        {result ? (
          <ScanResultDisplay result={result} onDismiss={dismissResult} />
        ) : (
          <ScanTarget inputRef={inputRef} isSubmitting={isSubmitting} onSubmit={submitScan} />
        )}
      </div>
    </main>
  );
}
