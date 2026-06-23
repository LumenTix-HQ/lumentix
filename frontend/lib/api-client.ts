const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

const TOKEN_KEY = "lumentix_access_token";
const REFRESH_KEY = "lumentix_refresh_token";

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

function setTokens(accessToken: string, refreshToken?: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

function clearTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const newAccessToken: string = data.access_token;
    const newRefreshToken: string | undefined = data.refresh_token;
    setTokens(newAccessToken, newRefreshToken);
    return newAccessToken;
  } catch {
    return null;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  isRetry = false,
): Promise<T> {
  const accessToken = getAccessToken();
  const authHeader: Record<string, string> = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};

  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (res.status === 401 && !isRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return request<T>(endpoint, options, true);
    }
    // Refresh failed — clear tokens and redirect to login
    clearTokens();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Session expired. Redirecting to login.");
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

// ── Typed helper functions ─────────────────────────────────────────────────────

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

// ── Named exports for token management ────────────────────────────────────────

export { setTokens, clearTokens, getAccessToken };

export const apiClient = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  login: (body: { email: string; password: string }) =>
    request<{ access_token: string; refresh_token?: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ── Events ────────────────────────────────────────────────────────────────
  getEvents: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<any>(`/events${qs}`);
  },
  getEvent: (id: string) => request<any>(`/events/${id}`),
  createEvent: (body: any, token: string) =>
    request<any>("/events", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),
  patchEvent: (id: string, body: any, token: string) =>
    request<any>(`/events/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),
  trigger_emergency_protocol: (eventId: string, body: any, token: string) =>
    request<any>(`/events/${eventId}/emergency`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),
  track_evacuation_status: (eventId: string, token: string) =>
    request<any>(`/events/${eventId}/evacuation`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  monitor_weather_conditions: (eventId: string, token: string) =>
    request<any>(`/events/${eventId}/weather/monitor`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  reschedule_event: (
    eventId: string,
    body: { startDate: string; endDate: string; reason?: string },
    token: string,
  ) =>
    request<any>(`/events/${eventId}/reschedule`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  // ── Insurance ─────────────────────────────────────────────────────────────
  purchaseInsurance: (body: { ticketId: string }, token: string) =>
    request<any>("/insurance/purchase", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  fileInsuranceClaim: (
    body: { ticketId: string; cancellationReason: string },
    token: string,
  ) =>
    request<any>("/insurance/claim", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  validateCancellationReason: (
    ticketId: string,
    reason: string,
    token: string,
  ) =>
    request<boolean>(
      `/insurance/validate?ticketId=${ticketId}&reason=${reason}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    ),

  getInsurancePolicyByTicket: (ticketId: string, token: string) =>
    request<any>(`/insurance/policy/${ticketId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getMyInsurancePolicies: (token: string) =>
    request<any[]>("/insurance/me", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getInsurancePool: (token: string) =>
    request<any>("/insurance/pool", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  // ── Reviews ───────────────────────────────────────────────────────────────
  submitReview: (
    body: {
      eventId: string;
      ticketId: string;
      rating: number;
      comment?: string;
    },
    token: string,
  ) =>
    request<any>("/reviews", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  getEventReviews: (eventId: string, token: string, page = 1, limit = 10) =>
    request<any>(`/reviews/event/${eventId}?page=${page}&limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getMyReviews: (token: string, page = 1) =>
    request<any>(`/reviews/me?page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getOrganizerReputation: (organizerId: string, token: string) =>
    request<any>(`/reviews/reputation/${organizerId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  recalculateReputation: (organizerId: string, token: string) =>
    request<any>(`/reviews/reputation/${organizerId}/recalculate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),

  verifyAttendance: (reviewId: string, token: string) =>
    request<any>(`/reviews/${reviewId}/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),

  // ── Age Verification ──────────────────────────────────────────────────────
  verifyAge: (body: any, token: string) =>
    request("/age-verification/verify", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  // ── Mobile Payments ───────────────────────────────────────────────────────
  processMobilePayment: (body: any, token: string) =>
    request("/mobile-payments/process", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  // ── Recommendations ───────────────────────────────────────────────────────
  getRecommendations: (token: string, limit = 10) =>
    request(`/recommendations?limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  // ── Resale ────────────────────────────────────────────────────────────────
  listTicketForResale: (ticketId: string, body: any, token: string) =>
    request(`/resale/list/${ticketId}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  buyResaleTicket: (ticketId: string, body: any, token: string) =>
    request(`/resale/buy/${ticketId}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  // ── Analytics ─────────────────────────────────────────────────────────────
  getEventAnalyticsDashboard: (eventId: string, token: string) =>
    request(`/analytics/events/${eventId}/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  // ── Gamification ──────────────────────────────────────────────────────────
  getMyGamificationProfile: (token: string) =>
    request<any>("/gamification/profile", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getUserGamificationProfile: (userId: string, token: string) =>
    request<any>(`/gamification/profile/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getAllAchievements: (token: string) =>
    request<any[]>("/gamification/achievements", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getMyAchievements: (token: string) =>
    request<any[]>("/gamification/achievements/mine", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  recordActivity: (
    body: {
      activityType: string;
      eventCategory?: string;
      context?: Record<string, unknown>;
    },
    token: string,
  ) =>
    request<any>("/gamification/activity", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  getLeaderboard: (token: string, period = "all_time", limit = 50) =>
    request<any[]>(
      `/gamification/leaderboard?period=${period}&limit=${limit}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    ),

  getActiveChallenges: (token: string) =>
    request<any[]>("/gamification/challenges", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  joinChallenge: (challengeId: string, token: string) =>
    request<any>(`/gamification/challenges/${challengeId}/join`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),

  getMyChallenges: (token: string) =>
    request<any[]>("/gamification/challenges/mine", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  // ── IoT Venue Capacity ────────────────────────────────────────────────────
  registerSensor: (
    eventId: string,
    body: { name: string; type: string; sectionId?: string; location?: string },
    token: string,
  ) =>
    request<any>(`/events/${eventId}/capacity/sensors`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  getSensors: (eventId: string, token: string) =>
    request<any[]>(`/events/${eventId}/capacity/sensors`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  deactivateSensor: (eventId: string, sensorId: string, token: string) =>
    request<any>(`/events/${eventId}/capacity/sensors/${sensorId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),

  pushSensorReading: (
    eventId: string,
    sensorId: string,
    apiKey: string,
    body: { value: number; status?: string },
  ) =>
    request<void>(`/events/${eventId}/capacity/sensors/${sensorId}/reading`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "X-Sensor-Key": apiKey },
    }),

  monitorVenueCapacity: (eventId: string, token: string) =>
    request<any>(`/events/${eventId}/capacity/monitor`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  optimizeSpaceUsage: (eventId: string, token: string) =>
    request<any>(`/events/${eventId}/capacity/optimize`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  updateCapacityLimits: (
    eventId: string,
    body: {
      maxAttendees: number;
      reason?: string;
      pauseSalesAtLimit?: boolean;
    },
    token: string,
  ) =>
    request<any>(`/events/${eventId}/capacity/limits`, {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  getCapacityHistory: (eventId: string, token: string, limit = 60) =>
    request<any[]>(`/events/${eventId}/capacity/history?limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getLatestSnapshot: (eventId: string, token: string) =>
    request<any>(`/events/${eventId}/capacity/snapshot/latest`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  // ── User Profile ──────────────────────────────────────────────────────────
  getMe: (token: string) =>
    request<{
      id: string;
      email: string;
      displayName: string | null;
      walletAddress: string | null;
      emailOptOut: boolean;
      createdAt: string;
    }>('/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  patchMe: (body: { displayName?: string }, token: string) =>
    request<{ id: string; displayName: string | null }>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  patchPreferences: (body: { emailOptOut: boolean }, token: string) =>
    request<{ emailOptOut: boolean }>('/users/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  walletChallenge: (token: string) =>
    request<{ challenge: string; expiresAt: string }>('/auth/wallet-challenge', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),

  walletVerify: (body: { signedXdr: string; publicKey: string }, token: string) =>
    request<{ walletAddress: string }>('/auth/wallet-verify', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  deactivateAccount: (token: string) =>
    request<void>('/users/me', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }),
};
