import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Event, EventCategory } from '../events/entities/event.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { Registration } from '../registrations/entities/registration.entity';

export interface OptimalTimingAnalysis {
  recommendedStartDate: Date;
  recommendedEndDate: Date;
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
    startDate: Date;
    endDate: Date;
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

@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(TicketEntity)
    private readonly ticketRepository: Repository<TicketEntity>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Registration)
    private readonly registrationRepository: Repository<Registration>,
  ) {}

  async analyzeOptimalTiming(
    category: EventCategory,
    location: string,
    duration: number, // hours
    targetAudience?: string,
  ): Promise<OptimalTimingAnalysis> {
    const historicalData = await this.getHistoricalData(category, location);
    const seasonalPatterns = this.analyzeSeasonalPatterns(historicalData);
    const competitionAnalysis = await this.analyzeCompetition(category, location);
    const demographicInsights = this.analyzeDemographicFactors(targetAudience);

    const optimalDate = this.calculateOptimalDate(
      seasonalPatterns,
      competitionAnalysis,
      demographicInsights,
      duration,
    );

    const confidence = this.calculateConfidence(
      historicalData.length,
      seasonalPatterns.consistency,
      competitionAnalysis.dataQuality,
    );

    return {
      recommendedStartDate: optimalDate.start,
      recommendedEndDate: optimalDate.end,
      confidence,
      factors: {
        seasonalScore: seasonalPatterns.score,
        competitionScore: competitionAnalysis.score,
        demographicScore: demographicInsights.score,
        historicalPerformance: this.calculateHistoricalScore(historicalData),
      },
      reasoning: this.generateReasoningExplanation(
        seasonalPatterns,
        competitionAnalysis,
        demographicInsights,
      ),
    };
  }

  async suggestEventSchedule(
    category: EventCategory,
    location: string,
    duration: number,
    dateRange: { start: Date; end: Date },
  ): Promise<EventScheduleSuggestion[]> {
    const suggestions: EventScheduleSuggestion[] = [];
    const current = new Date(dateRange.start);
    
    while (current <= dateRange.end) {
      const timeSlot = {
        startDate: new Date(current),
        endDate: new Date(current.getTime() + duration * 60 * 60 * 1000),
      };

      const analysis = await this.analyzeTimeSlot(timeSlot, category, location);
      
      suggestions.push({
        timeSlot,
        expectedAttendance: analysis.expectedAttendance,
        revenueProjection: analysis.revenueProjection,
        competitionLevel: analysis.competitionLevel,
        seasonalFactor: analysis.seasonalFactor,
        confidence: analysis.confidence,
      });

      current.setDate(current.getDate() + 1);
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
  }

  async predictAttendanceImpact(
    eventId: string,
    newStartDate: Date,
    newEndDate: Date,
  ): Promise<AttendanceImpactPrediction> {
    const event = await this.eventRepository.findOne({ where: { id: eventId } });
    if (!event) throw new Error('Event not found');

    const baselineAttendance = await this.calculateBaselineAttendance(event);
    const impactFactors = await this.calculateImpactFactors(
      event,
      newStartDate,
      newEndDate,
    );

    const projectedAttendance = Math.round(
      baselineAttendance *
      impactFactors.timeOfYear *
      impactFactors.dayOfWeek *
      impactFactors.timeOfDay *
      impactFactors.competition *
      impactFactors.demographics
    );

    return {
      baselineAttendance,
      projectedAttendance,
      impactFactors,
      riskFactors: this.identifyRiskFactors(impactFactors, newStartDate),
      opportunities: this.identifyOpportunities(impactFactors, newStartDate),
    };
  }

  private async getHistoricalData(category: EventCategory, location: string) {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const events = await this.eventRepository.find({
      where: {
        category,
        location,
        startDate: Between(oneYearAgo, new Date()),
      },
      relations: ['tickets', 'payments'],
    });

    return Promise.all(
      events.map(async (event) => {
        const ticketsSold = await this.ticketRepository.count({
          where: { eventId: event.id, status: 'valid' },
        });
        const revenue = await this.paymentRepository
          .createQueryBuilder('p')
          .select('COALESCE(SUM(p.amount), 0)', 'total')
          .where('p.eventId = :id AND p.status = :status', {
            id: event.id,
            status: PaymentStatus.CONFIRMED,
          })
          .getRawOne();

        return {
          ...event,
          ticketsSold,
          revenue: Number(revenue?.total || 0),
        };
      })
    );
  }

  private analyzeSeasonalPatterns(historicalData: any[]) {
    const monthlyPerformance = new Map<number, { attendance: number; revenue: number; count: number }>();
    
    historicalData.forEach(event => {
      const month = event.startDate.getMonth();
      const existing = monthlyPerformance.get(month) || { attendance: 0, revenue: 0, count: 0 };
      existing.attendance += event.ticketsSold;
      existing.revenue += event.revenue;
      existing.count += 1;
      monthlyPerformance.set(month, existing);
    });

    const monthlyAverages = Array.from(monthlyPerformance.entries()).map(([month, data]) => ({
      month,
      avgAttendance: data.count > 0 ? data.attendance / data.count : 0,
      avgRevenue: data.count > 0 ? data.revenue / data.count : 0,
    }));

    const bestMonth = monthlyAverages.reduce((best, current) => 
      current.avgAttendance > best.avgAttendance ? current : best
    );

    const consistency = this.calculateSeasonalConsistency(monthlyAverages);

    return {
      bestMonth: bestMonth.month,
      score: bestMonth.avgAttendance / Math.max(...monthlyAverages.map(m => m.avgAttendance)),
      consistency,
      monthlyData: monthlyAverages,
    };
  }

  private async analyzeCompetition(category: EventCategory, location: string) {
    const nextThreeMonths = new Date();
    nextThreeMonths.setMonth(nextThreeMonths.getMonth() + 3);

    const competingEvents = await this.eventRepository.count({
      where: {
        category,
        location,
        startDate: Between(new Date(), nextThreeMonths),
      },
    });

    const competitionLevel = competingEvents < 2 ? 'low' : competingEvents < 5 ? 'medium' : 'high';
    const score = competingEvents < 2 ? 1.0 : competingEvents < 5 ? 0.7 : 0.4;

    return {
      competingEvents,
      level: competitionLevel,
      score,
      dataQuality: 0.8, // Simplified for now
    };
  }

  private analyzeDemographicFactors(targetAudience?: string) {
    // Simplified demographic analysis
    const demographicScores = {
      'young-adults': { weekends: 1.2, evenings: 1.3, score: 0.9 },
      'families': { weekends: 1.4, afternoons: 1.2, score: 0.8 },
      'professionals': { weekdays: 1.1, evenings: 1.2, score: 0.85 },
      'seniors': { weekdays: 1.2, mornings: 1.3, score: 0.7 },
    };

    const profile = demographicScores[targetAudience as keyof typeof demographicScores] || 
                   { weekends: 1.0, evenings: 1.0, score: 0.75 };

    return {
      targetAudience,
      preferences: profile,
      score: profile.score,
    };
  }

  private calculateOptimalDate(
    seasonalPatterns: any,
    competitionAnalysis: any,
    demographicInsights: any,
    duration: number,
  ) {
    const now = new Date();
    const optimalMonth = seasonalPatterns.bestMonth;
    
    // Find next occurrence of optimal month
    let targetDate = new Date(now.getFullYear(), optimalMonth, 15);
    if (targetDate < now) {
      targetDate.setFullYear(targetDate.getFullYear() + 1);
    }

    // Adjust for demographic preferences
    if (demographicInsights.preferences.weekends > 1.1) {
      // Prefer weekends
      while (targetDate.getDay() !== 6) { // Saturday
        targetDate.setDate(targetDate.getDate() + 1);
      }
    }

    const endDate = new Date(targetDate.getTime() + duration * 60 * 60 * 1000);

    return { start: targetDate, end: endDate };
  }

  private calculateConfidence(
    dataPoints: number,
    seasonalConsistency: number,
    competitionDataQuality: number,
  ): number {
    const dataConfidence = Math.min(dataPoints / 20, 1.0); // Max confidence at 20+ data points
    return (dataConfidence + seasonalConsistency + competitionDataQuality) / 3;
  }

  private calculateSeasonalConsistency(monthlyAverages: any[]): number {
    if (monthlyAverages.length < 2) return 0.5;
    
    const attendances = monthlyAverages.map(m => m.avgAttendance);
    const mean = attendances.reduce((sum, val) => sum + val, 0) / attendances.length;
    const variance = attendances.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / attendances.length;
    const stdDev = Math.sqrt(variance);
    
    // Lower standard deviation = higher consistency
    return Math.max(0, 1 - (stdDev / mean));
  }

  private calculateHistoricalScore(historicalData: any[]): number {
    if (historicalData.length === 0) return 0.5;
    
    const avgAttendance = historicalData.reduce((sum, event) => sum + event.ticketsSold, 0) / historicalData.length;
    const avgRevenue = historicalData.reduce((sum, event) => sum + event.revenue, 0) / historicalData.length;
    
    // Normalize scores (simplified)
    return Math.min((avgAttendance / 100 + avgRevenue / 1000) / 2, 1.0);
  }

  private generateReasoningExplanation(
    seasonalPatterns: any,
    competitionAnalysis: any,
    demographicInsights: any,
  ): string[] {
    const reasons: string[] = [];
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    reasons.push(`${monthNames[seasonalPatterns.bestMonth]} shows highest historical attendance for this category`);
    
    if (competitionAnalysis.level === 'low') {
      reasons.push('Low competition period identified');
    } else if (competitionAnalysis.level === 'high') {
      reasons.push('High competition detected - consider alternative dates');
    }
    
    if (demographicInsights.targetAudience) {
      reasons.push(`Optimized for ${demographicInsights.targetAudience} preferences`);
    }
    
    return reasons;
  }

  private async analyzeTimeSlot(
    timeSlot: { startDate: Date; endDate: Date },
    category: EventCategory,
    location: string,
  ) {
    const seasonalFactor = this.getSeasonalFactor(timeSlot.startDate);
    const competitionLevel = await this.getCompetitionLevel(timeSlot, category, location);
    const expectedAttendance = this.estimateAttendance(seasonalFactor, competitionLevel, category);
    
    return {
      expectedAttendance,
      revenueProjection: expectedAttendance * 50, // Simplified pricing
      competitionLevel: competitionLevel as 'low' | 'medium' | 'high',
      seasonalFactor,
      confidence: Math.random() * 0.3 + 0.7, // Simplified confidence
    };
  }

  private getSeasonalFactor(date: Date): number {
    const month = date.getMonth();
    // Simplified seasonal factors
    const factors = [0.7, 0.6, 0.8, 0.9, 1.0, 1.1, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7];
    return factors[month];
  }

  private async getCompetitionLevel(
    timeSlot: { startDate: Date; endDate: Date },
    category: EventCategory,
    location: string,
  ): Promise<string> {
    const competingEvents = await this.eventRepository.count({
      where: {
        category,
        location,
        startDate: Between(timeSlot.startDate, timeSlot.endDate),
      },
    });
    
    return competingEvents < 2 ? 'low' : competingEvents < 5 ? 'medium' : 'high';
  }

  private estimateAttendance(seasonalFactor: number, competitionLevel: string, category: EventCategory): number {
    const baseAttendance = 100; // Simplified base
    const competitionMultiplier = competitionLevel === 'low' ? 1.2 : competitionLevel === 'medium' ? 1.0 : 0.8;
    return Math.round(baseAttendance * seasonalFactor * competitionMultiplier);
  }

  private async calculateBaselineAttendance(event: Event): Promise<number> {
    const similarEvents = await this.eventRepository.find({
      where: { category: event.category, organizerId: event.organizerId },
    });
    
    if (similarEvents.length === 0) return 50; // Default baseline
    
    const totalAttendance = await Promise.all(
      similarEvents.map(async (e) => {
        return await this.ticketRepository.count({
          where: { eventId: e.id, status: 'valid' },
        });
      })
    );
    
    return Math.round(totalAttendance.reduce((sum, att) => sum + att, 0) / totalAttendance.length);
  }

  private async calculateImpactFactors(
    event: Event,
    newStartDate: Date,
    newEndDate: Date,
  ) {
    return {
      timeOfYear: this.getSeasonalFactor(newStartDate),
      dayOfWeek: this.getDayOfWeekFactor(newStartDate),
      timeOfDay: this.getTimeOfDayFactor(newStartDate),
      competition: await this.getCompetitionFactor(event, newStartDate, newEndDate),
      demographics: 1.0, // Simplified
    };
  }

  private getDayOfWeekFactor(date: Date): number {
    const day = date.getDay();
    // Weekend boost for most events
    return day === 0 || day === 6 ? 1.2 : 1.0;
  }

  private getTimeOfDayFactor(date: Date): number {
    const hour = date.getHours();
    // Evening events typically perform better
    if (hour >= 18 && hour <= 21) return 1.3;
    if (hour >= 14 && hour <= 17) return 1.1;
    return 1.0;
  }

  private async getCompetitionFactor(
    event: Event,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const competingEvents = await this.eventRepository.count({
      where: {
        category: event.category,
        location: event.location,
        startDate: Between(startDate, endDate),
      },
    });
    
    return competingEvents < 2 ? 1.2 : competingEvents < 5 ? 1.0 : 0.8;
  }

  private identifyRiskFactors(impactFactors: any, date: Date): string[] {
    const risks: string[] = [];
    
    if (impactFactors.competition < 0.9) {
      risks.push('High competition from similar events');
    }
    
    if (impactFactors.timeOfYear < 0.8) {
      risks.push('Low seasonal demand period');
    }
    
    if (date.getDay() >= 1 && date.getDay() <= 4) {
      risks.push('Weekday scheduling may reduce attendance');
    }
    
    return risks;
  }

  private identifyOpportunities(impactFactors: any, date: Date): string[] {
    const opportunities: string[] = [];
    
    if (impactFactors.competition > 1.1) {
      opportunities.push('Low competition window identified');
    }
    
    if (impactFactors.timeOfYear > 1.1) {
      opportunities.push('Peak seasonal demand period');
    }
    
    if (date.getDay() === 0 || date.getDay() === 6) {
      opportunities.push('Weekend scheduling advantage');
    }
    
    return opportunities;
  }
}
