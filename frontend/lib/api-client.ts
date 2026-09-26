import type { Event, PaginatedResponse } from "@/types/event";
import type { CreateEventFormValues } from "@/lib/schemas/create-event.schema";
import type { SponsorTier } from "@/components/SponsorTierCard";

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

  patchMe: (body: { displayName?: string }) =>
    request<{ id: string; displayName: string | null }>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  getNotificationPreferences: () =>
    request<NotificationPreferences>("/notifications/preferences"),

  saveNotificationPreferences: (body: SaveNotificationPreferences) =>
    request<NotificationPreferences>("/notifications/preferences", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

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
  submitReview: (
    body: { eventId: string; ticketId: string; rating: number; comment?: string },
    _token?: string,
  ) =>
    request<any>("/reviews", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getMyReviews: (_token?: string) =>
    request<any>("/reviews/me"),

  getOrganizerReputation: (organizerId: string, _token?: string) =>
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

  // Terms of Service (Issue #1191)
  save_event_tos: (eventId: string, body: SaveEventTosInput, token?: string) =>
    request<EventTos>(`/events/${eventId}/terms-of-service`, {
      method: "PATCH",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    }),
  saveEventTos: (eventId: string, body: SaveEventTosInput, token?: string) =>
    apiClient.save_event_tos(eventId, body, token),

  validate_tos_agreement: (eventId: string, version: number) =>
    request<boolean>(`/events/${eventId}/terms-of-service/validate/${version}`, {
      method: "POST",
    }),
  validateTosAgreement: (eventId: string, version: number) =>
    apiClient.validate_tos_agreement(eventId, version),

  fetch_tos_for_checkout: (eventId: string) =>
    request<EventTos>(`/events/${eventId}/terms-of-service`),
  fetchTosForCheckout: (eventId: string) =>
    apiClient.fetch_tos_for_checkout(eventId),

  get_tos_templates: (eventId: string = "default") =>
    request<TosTemplate[]>(`/events/${eventId}/terms-of-service/templates`),
  getTosTemplates: (eventId: string = "default") =>
    apiClient.get_tos_templates(eventId),

  apply_tos_template: (
    eventId: string,
    templateId: string,
    customOverrides?: Partial<SaveEventTosInput>,
    token?: string,
  ) =>
    request<EventTos>(`/events/${eventId}/terms-of-service/apply-template/${templateId}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(customOverrides ?? {}),
    }),
  applyTosTemplate: (
    eventId: string,
    templateId: string,
    customOverrides?: Partial<SaveEventTosInput>,
    token?: string,
  ) =>
    apiClient.apply_tos_template(eventId, templateId, customOverrides, token),

  // Scan Velocity & Gate Throughput (Issue #1195)
  calculate_scan_velocity: (eventId: string, gateId?: string, token?: string) =>
    request<ScanVelocityResult>(
      `/events/${eventId}/scan-analytics/scan-velocity${gateId ? `?gateId=${encodeURIComponent(gateId)}` : ""}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    ),
  calculateScanVelocity: (eventId: string, gateId?: string, token?: string) =>
    apiClient.calculate_scan_velocity(eventId, gateId, token),

  track_gate_throughput: (eventId: string, gateId?: string, token?: string) =>
    request<GateThroughputStats>(
      `/events/${eventId}/scan-analytics/throughput${gateId ? `?gateId=${encodeURIComponent(gateId)}` : ""}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    ),
  trackGateThroughput: (eventId: string, gateId?: string, token?: string) =>
    apiClient.track_gate_throughput(eventId, gateId, token),

  fetch_realtime_scan_speed: (eventId: string, gateId?: string, minutesBack: number = 5, token?: string) => {
    const params = new URLSearchParams();
    if (gateId) params.set("gateId", gateId);
    if (minutesBack) params.set("minutesBack", minutesBack.toString());
    const qs = params.toString() ? `?${params.toString()}` : "";
    return request<ScanMetricData[]>(`/events/${eventId}/scan-analytics/realtime-speed${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
  fetchRealtimeScanSpeed: (eventId: string, gateId?: string, minutesBack: number = 5, token?: string) =>
    apiClient.fetch_realtime_scan_speed(eventId, gateId, minutesBack, token),

  get_staffing_recommendation: (eventId: string, gateId?: string, token?: string) =>
    request<StaffingRecommendation>(
      `/events/${eventId}/scan-analytics/staffing-recommendation${gateId ? `?gateId=${encodeURIComponent(gateId)}` : ""}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    ),
  getStaffingRecommendation: (eventId: string, gateId?: string, token?: string) =>
    apiClient.get_staffing_recommendation(eventId, gateId, token),
};
