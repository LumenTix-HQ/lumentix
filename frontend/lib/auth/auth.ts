import { clearOfflineEventData } from "@/lib/pwa/offline-events";

export async function clearTokens(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Logout must be resilient — the caller clears in-memory state regardless.
  } finally {
    // Drop cached event/ticket responses so the next user of this device
    // cannot read them from the service worker cache (#1613).
    clearOfflineEventData();
  }
}

export function getAccessToken(): string | null {
  return null;
}

export function getRefreshToken(): string | null {
  return null;
}
