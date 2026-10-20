export async function clearTokens(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Logout must be resilient — the caller clears in-memory state regardless.
  }
}

export function getAccessToken(): string | null {
  return null;
}

export function getRefreshToken(): string | null {
  return null;
}
