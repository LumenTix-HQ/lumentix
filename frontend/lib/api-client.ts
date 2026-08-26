const PROXY_BASE = "/api/proxy";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_RETRY_DELAY_MS = 300;

class ApiProxyError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiProxyError";
    this.status = status;
  }
}

function isIdempotent(method?: string): boolean {
  const m = (method ?? "GET").toUpperCase();
  return m === "GET" || m === "HEAD";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * fetch wrapper that retries idempotent (GET/HEAD) requests with exponential
 * backoff on transient failures — network errors and 5xx responses — before
 * surfacing the result. Non-idempotent requests are never retried. The retry
 * budget is capped so a persistent failure surfaces promptly.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  { maxRetries = DEFAULT_MAX_RETRIES, baseDelayMs = DEFAULT_BASE_RETRY_DELAY_MS }: RetryOptions = {},
): Promise<Response> {
  const retryable = isIdempotent(init.method);
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (retryable && res.status >= 500 && attempt < maxRetries) {
        await delay(baseDelayMs * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (!retryable || attempt === maxRetries) throw err;
      await delay(baseDelayMs * 2 ** attempt);
    }
  }
  // Unreachable for retryable requests (loop returns or throws), but keeps TS happy.
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  isRetry = false,
): Promise<T> {
  const path = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  const url = `${PROXY_BASE}/${path}`;

  const res = await fetchWithRetry(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (res.status === 401 && !isRetry) {
    const refreshRes = await fetch("/api/auth/refresh", { method: "POST" });
    if (refreshRes.ok) {
      return request<T>(endpoint, options, true);
    }
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new ApiProxyError(401, "Session expired. Redirecting to login.");
  }

  if (!res.ok) {
    const body = await res.text();
    let message = `API error ${res.status}`;
    try {
      const parsed = JSON.parse(body);
      message = Array.isArray(parsed.message) ? parsed.message[0] : (parsed.message ?? message);
    } catch {
      message = body || message;
    }
    throw new ApiProxyError(res.status, message);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken, refreshToken }),
  });
  if (!response.ok) {
    throw new ApiProxyError(response.status, "Unable to create authenticated session");
  }
}

export const apiClient = {
  login: (body: { email: string; password: string }) =>
    request<{ ok: boolean }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getEvents: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<any>(`/events${qs}`);
  },
  getEvent: (id: string) => request<any>(`/events/${id}`),
  createEvent: (body: any) =>
    request<any>("/events", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchEvent: (id: string, body: any) =>
    request<any>(`/events/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  getMyPayments: () => request<any>("/payments/my-payments"),

  getTransactions: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<any>(`/transactions${qs}`);
  },
  getStellarTransactions: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<any>(`/transactions/stellar${qs}`);
  },

  getMe: () =>
    request<{
      id: string;
      email: string;
      displayName: string | null;
      walletAddress: string | null;
      emailOptOut: boolean;
      createdAt: string;
    }>("/users/me"),

  patchMe: (body: { displayName?: string }) =>
    request<{ id: string; displayName: string | null }>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
};
