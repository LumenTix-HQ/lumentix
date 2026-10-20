import type { Event, PaginatedResponse } from "@/types/event";
import type { CreateEventFormValues } from "@/lib/schemas/create-event.schema";
import type { SponsorTier } from "@/components/SponsorTierCard";
import type {
  Achievement,
  ActivityResult,
  Challenge,
  ChallengeParticipation,
  GamificationProfile,
  LeaderboardEntry,
  LeaderboardPeriod,
  UserAchievement,
  ActivityType,
} from "@/types/gamification";
import type {
  CancellationReason,
  InsuranceClaimResult,
  InsurancePolicy,
  InsurancePool,
} from "@/types/insurance";
import type {
  GiftTicketInput,
  GiftWrapResult,
  UnwrapAnimation,
} from "@/types/gifting";

export interface SponsorEventSummary {
  id: string;
  title: string;
  sponsorTiers?: SponsorTier[];
}

export interface InitiateSponsorshipResult {
  xdr: string;
  contributionId: string;
}

export interface ConfirmSponsorshipResult {
  rank?: number;
  transactionHash?: string;
}

export interface InitiateSponsorshipInput {
  tierId: string;
  amount: number;
  displayName?: string;
  logoUrl?: string;
  sponsorPublicKey: string;
}
import type {
  BuyResaleTicketDto,
  ListTicketForResaleDto,
  ResaleMarketplaceResponse,
  ResalePurchaseResult,
} from "@/types/resale";

export interface BatchTransferEntry {
  ticketId: string;
  recipientUserId: string;
}

export interface BatchTransferResult {
  success: boolean;
  transferredCount: number;
  errors?: string[];
}

import type {
  NotificationPreferences,
  SaveNotificationPreferences,
} from "@/types/notification-preference";


export interface EventTos {
  id: string;
  eventId: string;
  termsContent: string;
  liabilityDisclaimers?: string | null;
  customAgreements?: string | null;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaveEventTosInput {
  termsContent: string;
  liabilityDisclaimers?: string;
  customAgreements?: string;
}

export interface TosTemplate {
  id: string;
  name: string;
  category: 'general' | 'liability' | 'media' | 'refund';
  description: string;
  defaultTerms: string;
  defaultDisclaimers: string;
  defaultAgreements: string;
}

export interface ScanVelocityResult {
  eventId: string;
  gateId: string | null;
  scansPerMinute: number;
}

export interface GateThroughputStats {
  gateId: string | null;
  scanVelocity: number;
  avgScanTimeMs: number;
  totalScans: number;
  failedScans: number;
  errorRate: number;
}

export interface ScanMetricData {
  id: string;
  eventId: string;
  gateId: string | null;
  scansPerMinute: number;
  avgScanTimeMs: number;
  totalScansInWindow: number;
  failedScans: number;
  errorRate: number;
  recordedAt: string;
}

export interface StaffingRecommendation {
  eventId: string;
  gateId: string | null;
  currentVelocity: number;
  recommendedGates: number;
  queueStatus: 'low' | 'optimal' | 'congested' | 'critical';
  recommendationText: string;
}

const PROXY_BASE = "/api/proxy";

/** The events list endpoint may return a bare array or a paginated envelope. */
export type EventsResponse = Event[] | PaginatedResponse<Event>;
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
    ...options,
    // Spread options first so the merged headers below are not replaced by the
    // caller's headers object (which would drop the default Content-Type).
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
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

/** Low-level proxied request, exposed so callers (and tests) can pass custom options. */
export const apiRequest = request;

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

export const apiClient = {
  login: (body: { email: string; password: string }) =>
    request<{ ok: boolean }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  walletChallenge: (publicKey: string) =>
    request<{ nonce: string; accountAddress: string }>("/auth/wallet-challenge", {
      method: "POST",
      body: JSON.stringify({ publicKey }),
    }),

  walletVerify: (body: { nonce: string; signature: string; publicKey: string }) =>
    request<{
      walletAddress?: string;
      access_token?: string;
      refresh_token?: string;
    }>("/auth/wallet-verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getEvents: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<EventsResponse>(`/events${qs}`);
  },
  getEvent: (id: string) => request<Event>(`/events/${id}`),
  createEvent: (body: CreateEventFormValues) =>
    request<Event>("/events", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchEvent: (id: string, body: Partial<CreateEventFormValues>) =>
    request<Event>(`/events/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

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
      stellarPublicKey?: string | null;
      emailOptOut: boolean;
      createdAt: string;
    }>("/users/me"),

  getResaleMarketplace: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<ResaleMarketplaceResponse>(`/resale/marketplace${qs}`);
  },
  listTicketForResale: (ticketId, dto: ListTicketForResaleDto) =>
    request(`/resale/list/${ticketId}`, {
      method: "POST",
      body: JSON.stringify(dto),
    }),
  buyResaleTicket: (ticketId, dto: BuyResaleTicketDto) =>
    request<ResalePurchaseResult>(`/resale/buy/${ticketId}`, {
      method: "POST",
      body: JSON.stringify(dto),
    }),
  cancelResaleListing: (ticketId: string) =>
    request(`/resale/cancel/${ticketId}`, { method: "POST" }),

  batchTransferTickets: (transfers: BatchTransferEntry[]) =>
    request<BatchTransferResult>("/tickets/batch-transfer", {
      method: "POST",
      body: JSON.stringify({ transfers }),
    }),

  giftTicket: (ticketId: string, body: GiftTicketInput) =>
    request<GiftWrapResult>(`/tickets/${ticketId}/gift`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  rescheduleGift: (giftId: string, scheduledFor: string) =>
    request<GiftWrapResult>(`/tickets/gifts/${giftId}/schedule`, {
      method: "POST",
      body: JSON.stringify({ scheduledFor }),
    }),

  unwrapGift: (giftId: string) =>
    request<UnwrapAnimation>(`/tickets/gifts/${giftId}/unwrap`, {
      method: "POST",
    }),

  cancelGift: (giftId: string) =>
    request<GiftWrapResult>(`/tickets/gifts/${giftId}/cancel`, {
      method: "POST",
    }),

  patchMe: (body: { displayName?: string }) =>
    request<{ id: string; displayName: string | null }>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  patchPreferences: (body: { emailOptOut?: boolean }) =>
    request<{ emailOptOut: boolean }>("/users/me/notification-preferences", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deactivateAccount: () =>
    request<void>("/users/me", {
      method: "DELETE",
    }),

  getNotificationPreferences: () =>
    request<NotificationPreferences>("/notifications/preferences"),

  saveNotificationPreferences: (body: SaveNotificationPreferences) =>
    request<NotificationPreferences>("/notifications/preferences", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  logout: async () => {
    // Hit the Next.js route directly — routing it through `request()` would
    // prepend PROXY_BASE and resolve to the wrong backend path.
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    return { ok: true };
  },

  // Gamification — auth is attached by /api/proxy from the session cookie
  getMyGamificationProfile: () => request<GamificationProfile>("/gamification/profile/me"),
  getAllAchievements: () => request<Achievement[]>("/gamification/achievements"),
  getMyAchievements: () => request<UserAchievement[]>("/gamification/achievements/mine"),
  getLeaderboard: (period: LeaderboardPeriod, limit = 50) =>
    request<LeaderboardEntry[]>(
      `/gamification/leaderboard?${new URLSearchParams({ period, limit: String(limit) }).toString()}`,
    ),
  getActiveChallenges: () => request<Challenge[]>("/gamification/challenges"),
  getMyChallenges: () => request<ChallengeParticipation[]>("/gamification/challenges/mine"),
  joinChallenge: (challengeId: string) =>
    request<ChallengeParticipation>(`/gamification/challenges/${challengeId}/join`, {
      method: "POST",
    }),
  recordActivity: (body: { activityType: ActivityType; metadata?: Record<string, unknown> }) =>
    request<ActivityResult>("/gamification/activity", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Ticket insurance
  getMyInsurancePolicies: () => request<InsurancePolicy[]>("/insurance/me"),
  getInsurancePool: () => request<InsurancePool>("/insurance/pool"),
  purchaseInsurance: (body: { ticketId: string }) =>
    request<InsurancePolicy>("/insurance/purchase", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  fileInsuranceClaim: (body: { ticketId: string; cancellationReason: CancellationReason }) =>
    request<InsuranceClaimResult>("/insurance/claim", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getSponsorEvent: (id: string) => request<SponsorEventSummary>(`/events/${id}`),
  initiateSponsorship: (eventId: string, body: InitiateSponsorshipInput) =>
    request<InitiateSponsorshipResult>(`/events/${eventId}/sponsors`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  confirmSponsorship: (contributionId: string, signedXdr: string) =>
    request<ConfirmSponsorshipResult>(`/sponsors/contributions/${contributionId}/confirm`, {
      method: "POST",
      body: JSON.stringify({ signedXdr }),
    }),
  submitReview: (body: { eventId: string; ticketId: string; rating: number; comment?: string }) =>
    request<any>("/reviews", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getMyReviews: () =>
    request<any>("/reviews/me"),

  getOrganizerReputation: (organizerId: string) =>
    request<any>(`/reviews/reputation/${organizerId}`),

  getEventSentiment: (eventId: string) =>
    request<any>(`/reviews/events/${eventId}/sentiment`),

  getRecommendations: (userId: string, limit?: number) =>
    request<any>(`/recommendations/${userId}${limit ? `?limit=${limit}` : ""}`),

  updateUserPreferences: (
    userId: string,
    body: { preferences: Array<{ category?: string | null; location?: string | null; weight: number }> },
  ) =>
    request<any>(`/recommendations/${userId}/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  // Terms of Service (Issue #1191) — auth is attached by /api/proxy
  saveEventTos: (eventId: string, body: SaveEventTosInput) =>
    request<EventTos>(`/events/${eventId}/terms-of-service`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  validateTosAgreement: (eventId: string, version: number) =>
    request<boolean>(`/events/${eventId}/terms-of-service/validate/${version}`, {
      method: "POST",
    }),

  fetchTosForCheckout: (eventId: string) =>
    request<EventTos>(`/events/${eventId}/terms-of-service`),

  getTosTemplates: (eventId: string = "default") =>
    request<TosTemplate[]>(`/events/${eventId}/terms-of-service/templates`),

  applyTosTemplate: (
    eventId: string,
    templateId: string,
    customOverrides?: Partial<SaveEventTosInput>,
  ) =>
    request<EventTos>(`/events/${eventId}/terms-of-service/apply-template/${templateId}`, {
      method: "POST",
      body: JSON.stringify(customOverrides ?? {}),
    }),

  // Scan Velocity & Gate Throughput (Issue #1195)
  calculateScanVelocity: (eventId: string, gateId?: string) =>
    request<ScanVelocityResult>(
      `/events/${eventId}/scan-analytics/scan-velocity${gateId ? `?gateId=${encodeURIComponent(gateId)}` : ""}`,
    ),

  trackGateThroughput: (eventId: string, gateId?: string) =>
    request<GateThroughputStats>(
      `/events/${eventId}/scan-analytics/throughput${gateId ? `?gateId=${encodeURIComponent(gateId)}` : ""}`,
    ),

  fetchRealtimeScanSpeed: (eventId: string, gateId?: string, minutesBack: number = 5) => {
    const params = new URLSearchParams();
    if (gateId) params.set("gateId", gateId);
    if (minutesBack) params.set("minutesBack", minutesBack.toString());
    const qs = params.toString() ? `?${params.toString()}` : "";
    return request<ScanMetricData[]>(`/events/${eventId}/scan-analytics/realtime-speed${qs}`);
  },

  getStaffingRecommendation: (eventId: string, gateId?: string) =>
    request<StaffingRecommendation>(
      `/events/${eventId}/scan-analytics/staffing-recommendation${gateId ? `?gateId=${encodeURIComponent(gateId)}` : ""}`,
    ),
};
