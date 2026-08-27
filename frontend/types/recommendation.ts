export interface RecommendationDto {
  eventId: string;
  title: string;
  category: string;
  location: string;
  startDate: string;
  ticketPrice: number;
  currency: string;
  score: number;
  reason?: string;
}

export interface RecommendationResponse {
  userId: string;
  recommendations: RecommendationDto[];
  generatedAt: string;
}

export interface PreferenceEntryDto {
  category?: string;
  location?: string;
  weight: number;
}

export interface UpdatePreferencesDto {
  preferences: PreferenceEntryDto[];
}
