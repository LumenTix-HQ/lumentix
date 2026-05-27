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
}

export const schedulingService = new SchedulingService();
