const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`API error ${res.status}: ${errorBody}`);
  }

  return res.json();
}

export const apiClient = {
  // ── Age Verification ──────────────────────────────────────────────────
  verifyAge: (body: any, token: string) =>
    request('/age-verification/verify', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  setAgeRestriction: (eventId: string, body: any, token: string) =>
    request(`/age-verification/events/${eventId}/restriction`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  validateAgeCompliance: (eventId: string, token: string) =>
    request(`/age-verification/events/${eventId}/compliance`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getAgeVerificationStatus: (eventId: string, token: string) =>
    request(`/age-verification/events/${eventId}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  // ── Mobile Payments ───────────────────────────────────────────────────
  processMobilePayment: (body: any, token: string) =>
    request('/mobile-payments/process', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  getMobilePaymentStatus: (paymentId: string, token: string) =>
    request(`/mobile-payments/${paymentId}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  // ── Recommendations ───────────────────────────────────────────────────
  getRecommendations: (token: string, limit: number = 10) =>
    request(`/recommendations?limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  updatePreferences: (body: any, token: string) =>
    request('/recommendations/preferences', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  getSimilarEvents: (eventId: string, token: string, limit: number = 5) =>
    request(`/recommendations/events/${eventId}/similar?limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  // ── Resale Marketplace ────────────────────────────────────────────────
  listTicketForResale: (ticketId: string, body: any, token: string) =>
    request(`/resale/list/${ticketId}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  buyResaleTicket: (ticketId: string, body: any, token: string) =>
    request(`/resale/buy/${ticketId}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
    }),

  cancelResaleListing: (ticketId: string, token: string) =>
    request(`/resale/cancel/${ticketId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),

  getResaleHistory: (ticketId: string, token: string) =>
    request(`/resale/history/${ticketId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getOrganizerResaleEarnings: (token: string) =>
    request('/resale/organizer/earnings', {
      headers: { Authorization: `Bearer ${token}` },
    }),
};
