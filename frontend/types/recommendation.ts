/**
 * Frontend contract (+type) module for issue #1243 — Personalized event
 * recommendations.
 *
 * Kept as plain types so both the backend DTOs (recommendations.module) and
 * the client component can import the same shape without a framework
 * dependency; mirrors the `/recommendations` entry in docs/API_REFERENCE.
 */

export interface RecommendationDto {
  eventId: string;
  title: string;
  category: string | null;
  location: string | null;
  startDate: string;
  ticketPrice: number;
  currency: string;
  score: number;
  reason?: string | null;
}

export interface RecommendationResponse {
  userId: string;
  recommendations: RecommendationDto[];
  generatedAt: string;
}

export interface PreferenceEntryDto {
  category?: string | null;
  location?: string | null;
  weight: number;
}

export interface UpdatePreferencesDto {
  preferences: PreferenceEntryDto[];
}
