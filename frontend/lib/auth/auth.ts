export async function setTokens(access: string, refresh: string): Promise<void> {
  await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: access, refresh_token: refresh }),
  });
}

export async function clearTokens(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export function getAccessToken(): string | null {
  return null;
}

export function getRefreshToken(): string | null {
  return null;
}
