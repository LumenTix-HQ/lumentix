import { EventCategory } from '../types/event';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface AnalyzeOptimalTimingRequest {
  category: EventCategory;
  location: string;
  duration: number;
  targetAudience?: string;
}

export interface SuggestEventScheduleRequest {
  category: EventCategory;
  location: string;
  duration: number;
  dateRange: {
    start: string;
    end: string;
  };
}

export interface PredictAttendanceImpactRequest {
  newStartDate: string;
  newEndDate: string;
}

export interface OptimalTimingAnalysis {
  recommendedStartDate: string;
  recommendedEndDate: string;
  confidence: number;
  factors: {
    seasonalScore: number;
    competitionScore: number;
    demographicScore: number;
    historicalPerformance: number;
  };
  reasoning: string[];
}

export interface EventScheduleSuggestion {
  timeSlot: {
    startDate: string;
    endDate: string;
  };
  expectedAttendance: number;
  revenueProjection: number;
  competitionLevel: 'low' | 'medium' | 'high';
  seasonalFactor: number;
  confidence: number;
}

export interface AttendanceImpactPrediction {
  baselineAttendance: number;
  projectedAttendance: number;
  impactFactors: {
    timeOfYear: number;
    dayOfWeek: number;
    timeOfDay: number;
    competition: number;
    demographics: number;
  };
  riskFactors: string[];
  opportunities: string[];
}

export interface ConflictingEvent {
  id: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  organizerId: string;
  severity: 'partial' | 'full';
  overlapStart: string;
  overlapEnd: string;
  overlapDurationMinutes: number;
}

export interface ScheduleConflictReport {
  hasConflict: boolean;
  venue: string;
  requestedSlot: { startDate: string; endDate: string };
  conflicts: ConflictingEvent[];
  venueRecord?: any;
}

export interface AlternativeSlot {
  startDate: string;
  endDate: string;
  shiftHours: number;
  reason: string;
}

export interface ConflictResolution {
  outcome: 'no_conflict' | 'alternative_available' | 'unresolved';
  conflicts: ConflictingEvent[];
  recommendedSlot: AlternativeSlot | null;
  alternatives: AlternativeSlot[];
  reasoning: string[];
}

class SchedulingService {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = localStorage.getItem('authToken');
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async analyzeOptimalTiming(data: AnalyzeOptimalTimingRequest): Promise<OptimalTimingAnalysis> {
    return this.request<OptimalTimingAnalysis>('/scheduling/analyze-optimal-timing', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async suggestEventSchedule(data: SuggestEventScheduleRequest): Promise<EventScheduleSuggestion[]> {
    return this.request<EventScheduleSuggestion[]>('/scheduling/suggest-schedule', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async predictAttendanceImpact(
    eventId: string,
    data: PredictAttendanceImpactRequest
  ): Promise<AttendanceImpactPrediction> {
    return this.request<AttendanceImpactPrediction>(`/scheduling/predict-attendance-impact/${eventId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSeasonalInsights(category: EventCategory, location: string): Promise<{
    category: EventCategory;
    location: string;
    insights: string[];
  }> {
    const params = new URLSearchParams({ category, location });
    return this.request<{
      category: EventCategory;
      location: string;
      insights: string[];
    }>(`/scheduling/seasonal-insights?${params}`);
  }

  async analyzeCompetition(
    category: EventCategory,
    location: string,
    startDate: string,
    endDate: string
  ): Promise<{
    timeRange: { startDate: string; endDate: string };
    competingEvents: number;
    competitionLevel: string;
    recommendations: string[];
  }> {
    const params = new URLSearchParams({ category, location, startDate, endDate });
    return this.request<{
      timeRange: { startDate: string; endDate: string };
      competingEvents: number;
      competitionLevel: string;
      recommendations: string[];
    }>(`/scheduling/competition-analysis?${params}`);
  }

  async detect_schedule_conflict(
    venue: string,
    startDate: string,
    endDate: string,
    excludeEventId?: string,
  ): Promise<ScheduleConflictReport> {
    return this.request<ScheduleConflictReport>('/scheduling/detect-conflict', {
      method: 'POST',
      body: JSON.stringify({ venue, startDate, endDate, excludeEventId }),
    });
  }

  async suggest_alternative_slots(
    venue: string,
    startDate: string,
    endDate: string,
    options: {
      limit?: number;
      stepHours?: number;
      searchWindowDays?: number;
      excludeEventId?: string;
    } = {},
  ): Promise<AlternativeSlot[]> {
    return this.request<AlternativeSlot[]>('/scheduling/alternative-slots', {
      method: 'POST',
      body: JSON.stringify({
        venue,
        startDate,
        endDate,
        ...options,
      }),
    });
  }

  async resolve_conflict(
    venue: string,
    startDate: string,
    endDate: string,
    options: {
      limit?: number;
      stepHours?: number;
      searchWindowDays?: number;
      excludeEventId?: string;
    } = {},
  ): Promise<ConflictResolution> {
    return this.request<ConflictResolution>('/scheduling/resolve-conflict', {
      method: 'POST',
      body: JSON.stringify({
        venue,
        startDate,
        endDate,
        ...options,
      }),
    });
  }

  async detectScheduleConflict(
    venue: string,
    startDate: string,
    endDate: string,
    excludeEventId?: string,
  ): Promise<ScheduleConflictReport> {
    return this.detect_schedule_conflict(venue, startDate, endDate, excludeEventId);
  }

  async suggestAlternativeSlots(
    venue: string,
    startDate: string,
    endDate: string,
    options?: {
      limit?: number;
      stepHours?: number;
      searchWindowDays?: number;
      excludeEventId?: string;
    },
  ): Promise<AlternativeSlot[]> {
    return this.suggest_alternative_slots(venue, startDate, endDate, options);
  }

  async resolveConflict(
    venue: string,
    startDate: string,
    endDate: string,
    options?: {
      limit?: number;
      stepHours?: number;
      searchWindowDays?: number;
      excludeEventId?: string;
    },
  ): Promise<ConflictResolution> {
    return this.resolve_conflict(venue, startDate, endDate, options);
  }
}

export const schedulingService = new SchedulingService();

// Standalone function exports
export async function detect_schedule_conflict(
  venue: string,
  startDate: string,
  endDate: string,
  excludeEventId?: string,
): Promise<ScheduleConflictReport> {
  return schedulingService.detect_schedule_conflict(venue, startDate, endDate, excludeEventId);
}

export async function suggest_alternative_slots(
  venue: string,
  startDate: string,
  endDate: string,
  options?: {
    limit?: number;
    stepHours?: number;
    searchWindowDays?: number;
    excludeEventId?: string;
  },
): Promise<AlternativeSlot[]> {
  return schedulingService.suggest_alternative_slots(venue, startDate, endDate, options);
}

export async function resolve_conflict(
  venue: string,
  startDate: string,
  endDate: string,
  options?: {
    limit?: number;
    stepHours?: number;
    searchWindowDays?: number;
    excludeEventId?: string;
  },
): Promise<ConflictResolution> {
  return schedulingService.resolve_conflict(venue, startDate, endDate, options);
}

export const detectScheduleConflict = detect_schedule_conflict;
export const suggestAlternativeSlots = suggest_alternative_slots;
export const resolveConflict = resolve_conflict;
