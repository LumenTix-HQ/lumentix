import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  Between,
  FindOptionsWhere,
  In,
  LessThan,
  MoreThan,
  Not,
  ILike,
} from 'typeorm';
import {
  Event,
  EventCategory,
  EventStatus,
} from '../events/entities/event.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { Registration } from '../registrations/entities/registration.entity';
import { Venue, VenueStatus } from '../venues/entities/venue.entity';

// ─── Public interfaces ─────────────────────────────────────────────────────────

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
  timeSlot: { startDate: Date; endDate: Date };
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

/** One overlapping booking found at the same venue. */
export interface ScheduleConflict {
  eventId: string;
  title: string;
  organizerId: string;
  startDate: Date;
  endDate: Date;
  /**
   * The overlapping window itself — not the conflicting event's full range.
   * Use this to phrase "you'd clash for N hours" messages.
   */
  overlap: { start: Date; end: Date; hours: number };
  /** `full` when one booking is wholly inside the other. */
  severity: 'partial' | 'full';
}

export interface ScheduleConflictReport {
  hasConflict: boolean;
  venue: string;
  /** Registered `Venue` record when the location string matches one by name. */
  venueRecord: Venue | null;
  requestedSlot: { startDate: Date; endDate: Date };
  conflicts: ScheduleConflict[];
}

export interface AlternativeSlot {
  startDate: Date;
  endDate: Date;
  /** Signed hours from the requested start; negative = earlier. */
  shiftHours: number;
  reason: string;
}

export interface ConflictResolution {
  outcome: 'no_conflict' | 'alternative_available' | 'unresolved';
  conflicts: ScheduleConflict[];
  recommendedSlot: AlternativeSlot | null;
  alternatives: AlternativeSlot[];
  reasoning: string[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

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
    @InjectRepository(Venue)
    private readonly venueRepository: Repository<Venue>,
  ) {}

  // ── detect_schedule_conflict ──────────────────────────────────────────────

  /**
   * Find every PUBLISHED or COMPLETED event at the same venue whose time
   * window overlaps `[startDate, endDate)`.
   *
   * Overlap rule: two intervals overlap when each starts strictly before the
   * other ends. Touching boundaries (A ends at 18:00, B starts at 18:00) do
   * NOT conflict — both can use the venue on the same day with a clean gap.
   *
   * DRAFT, CANCELLED, and ARCHIVED events are excluded because they do not
   * hold the venue.
   *
   * Venue matching is case-insensitive and whitespace-trimmed so that
   * "Moscone Center" and " moscone center " resolve to the same venue.
   *
   * Pass `excludeEventId` when rescheduling an existing event so it does not
   * clash with its own current booking.
   */
  async detectScheduleConflict(
    venue: string,
    startDate: Date,
    endDate: Date,
    excludeEventId?: string,
  ): Promise<ScheduleConflictReport> {
    this.validateSlot(venue, startDate, endDate);
    const normVenue = venue.trim();

    const where: FindOptionsWhere<Event> = {
      location: ILike(normVenue),
      status: In([EventStatus.PUBLISHED, EventStatus.COMPLETED]),
      startDate: LessThan(endDate),
      endDate: MoreThan(startDate),
    };
    if (excludeEventId) {
      where.id = Not(excludeEventId);
    }

    const overlapping = await this.eventRepository.find({
      where,
      order: { startDate: 'ASC' },
    });

    const conflicts = overlapping.map((ev) =>
      this.describeConflict(ev, startDate, endDate),
    );

    if (conflicts.length > 0) {
      this.logger.warn(
        `Venue "${normVenue}" has ${conflicts.length} conflict(s) ` +
          `for [${startDate.toISOString()} – ${endDate.toISOString()}]`,
      );
    }

    const venueRecord = await this.findVenueByName(normVenue);

    return {
      hasConflict: conflicts.length > 0,
      venue: normVenue,
      venueRecord,
      requestedSlot: { startDate, endDate },
      conflicts,
    };
  }

  // ── suggest_alternative_slots ─────────────────────────────────────────────

  /**
   * Walk outward from the requested slot in `stepHours` increments and return
   * the first `limit` windows at which the venue is free.
   *
   * Candidates are probed in alternating order — forward then backward —
   * so the nearest free slot in either direction always appears first.
   *
   * The venue's existing bookings within `±searchWindowDays` are fetched in
   * a single DB query; overlap is then checked in memory for efficiency.
   *
   * Slots that would start in the past are skipped — they cannot be booked.
   */
  async suggestAlternativeSlots(
    venue: string,
    startDate: Date,
    endDate: Date,
    options: {
      limit?: number;
      stepHours?: number;
      searchWindowDays?: number;
      excludeEventId?: string;
    } = {},
  ): Promise<AlternativeSlot[]> {
    const limit = options.limit ?? 3;
    const stepHours = options.stepHours ?? 24;
    const searchWindowDays = options.searchWindowDays ?? 14;

    this.validateSlot(venue, startDate, endDate);

    if (limit <= 0 || stepHours <= 0 || searchWindowDays <= 0) {
      throw new BadRequestException(
        'limit, stepHours and searchWindowDays must all be positive',
      );
    }

    const normVenue = venue.trim();
    const durationMs = endDate.getTime() - startDate.getTime();
    const windowMs = searchWindowDays * 24 * 60 * 60 * 1000;

    // Single DB fetch for the entire ±window
    const where: FindOptionsWhere<Event> = {
      location: ILike(normVenue),
      status: In([EventStatus.PUBLISHED, EventStatus.COMPLETED]),
      startDate: LessThan(new Date(endDate.getTime() + windowMs)),
      endDate: MoreThan(new Date(startDate.getTime() - windowMs)),
    };
    if (options.excludeEventId) {
      where.id = Not(options.excludeEventId);
    }
    const nearby = await this.eventRepository.find({ where });

    const stepMs = stepHours * 60 * 60 * 1000;
    const maxSteps = Math.ceil(windowMs / stepMs);
    const found: AlternativeSlot[] = [];

    for (let step = 1; step <= maxSteps && found.length < limit; step++) {
      for (const direction of [1, -1]) {
        if (found.length >= limit) break;

        const shiftMs = direction * step * stepMs;
        const candidateStart = new Date(startDate.getTime() + shiftMs);
        const candidateEnd = new Date(candidateStart.getTime() + durationMs);

        // Never propose a slot that has already started
        if (candidateStart.getTime() <= Date.now()) continue;

        const clashes = nearby.some((ev) =>
          this.overlaps(ev, candidateStart, candidateEnd),
        );
        if (clashes) continue;

        const shiftHours = shiftMs / (60 * 60 * 1000);
        found.push({
          startDate: candidateStart,
          endDate: candidateEnd,
          shiftHours,
          reason:
            direction > 0
              ? `Venue is free ${Math.abs(shiftHours)}h after the requested slot`
              : `Venue is free ${Math.abs(shiftHours)}h before the requested slot`,
        });
      }
    }

    return found;
  }

  // ── resolve_conflict ──────────────────────────────────────────────────────

  /**
   * Combined detect + suggest in a single call.
   *
   * Returns one of three outcomes:
   *  - `no_conflict`          — the slot is free; nothing to do.
   *  - `alternative_available`— conflicts found; nearest free slot included.
   *  - `unresolved`           — conflicts found but no free slot in the window.
   *
   * This method is read-only: it produces a recommended plan but never moves
   * or cancels any booking. Applying the recommendation is the organizer's
   * decision.
   */
  async resolveConflict(
    venue: string,
    startDate: Date,
    endDate: Date,
    options: {
      limit?: number;
      stepHours?: number;
      searchWindowDays?: number;
      excludeEventId?: string;
    } = {},
  ): Promise<ConflictResolution> {
    const report = await this.detectScheduleConflict(
      venue,
      startDate,
      endDate,
      options.excludeEventId,
    );

    if (!report.hasConflict) {
      return {
        outcome: 'no_conflict',
        conflicts: [],
        recommendedSlot: null,
        alternatives: [],
        reasoning: [
          `Venue "${report.venue}" is free for the requested slot.`,
          `Checked: ${startDate.toISOString()} – ${endDate.toISOString()}.`,
        ],
      };
    }

    const alternatives = await this.suggestAlternativeSlots(
      venue,
      startDate,
      endDate,
      options,
    );

    const reasoning = report.conflicts.map(
      (c) =>
        `Overlaps "${c.title}" (${c.eventId}) for ` +
        `${c.overlap.hours}h — ${c.severity} overlap ` +
        `[${c.startDate.toISOString()} – ${c.endDate.toISOString()}]`,
    );

    if (alternatives.length === 0) {
      const windowDays = options.searchWindowDays ?? 14;
      reasoning.push(
        `No free slot found within ±${windowDays} days of the requested time.`,
      );
      return {
        outcome: 'unresolved',
        conflicts: report.conflicts,
        recommendedSlot: null,
        alternatives: [],
        reasoning,
      };
    }

    reasoning.push(
      `Nearest free slot: ${alternatives[0].startDate.toISOString()} ` +
        `(${alternatives[0].shiftHours > 0 ? '+' : ''}${alternatives[0].shiftHours}h).`,
    );

    return {
      outcome: 'alternative_available',
      conflicts: report.conflicts,
      recommendedSlot: alternatives[0],
      alternatives,
      reasoning,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** Shared guard used by all three public conflict methods. */
  private validateSlot(venue: string, startDate: Date, endDate: Date): void {
    if (!venue || !venue.trim()) {
      throw new BadRequestException('venue must not be empty');
    }
    if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
      throw new BadRequestException('startDate must be a valid Date');
    }
    if (!(endDate instanceof Date) || isNaN(endDate.getTime())) {
      throw new BadRequestException('endDate must be a valid Date');
    }
    if (endDate.getTime() <= startDate.getTime()) {
      throw new BadRequestException('endDate must be strictly after startDate');
    }
  }

  /**
   * Case-insensitive venue lookup — returns null when the location string
   * does not match any registered Venue record (it may still be valid as a
   * free-text location).
   */
  private async findVenueByName(name: string): Promise<Venue | null> {
    return this.venueRepository.findOne({
      where: { name: ILike(name), status: VenueStatus.ACTIVE },
    });
  }

  /** True when `event` and `[start, end)` share any time (exclusive boundaries). */
  private overlaps(event: Event, start: Date, end: Date): boolean {
    return (
      new Date(event.startDate).getTime() < end.getTime() &&
      new Date(event.endDate).getTime() > start.getTime()
    );
  }

  /**
   * Compute the exact overlapping window between an existing event and the
   * requested slot, and classify its severity.
   */
  private describeConflict(
    event: Event,
    start: Date,
    end: Date,
  ): ScheduleConflict {
    const eventStart = new Date(event.startDate);
    const eventEnd = new Date(event.endDate);

    const overlapStart = new Date(Math.max(eventStart.getTime(), start.getTime()));
    const overlapEnd = new Date(Math.min(eventEnd.getTime(), end.getTime()));
    const overlapMs = Math.max(0, overlapEnd.getTime() - overlapStart.getTime());

    const requestedIsInside =
      eventStart.getTime() <= start.getTime() &&
      eventEnd.getTime() >= end.getTime();
    const existingIsInside =
      start.getTime() <= eventStart.getTime() &&
      end.getTime() >= eventEnd.getTime();

    return {
      eventId: event.id,
      title: event.title,
      organizerId: event.organizerId,
      startDate: eventStart,
      endDate: eventEnd,
      overlap: {
        start: overlapStart,
        end: overlapEnd,
        hours: Math.round((overlapMs / (60 * 60 * 1000)) * 100) / 100,
      },
      severity: requestedIsInside || existingIsInside ? 'full' : 'partial',
    };
  }

  // ── Legacy scheduling methods (unchanged) ─────────────────────────────────

  async analyzeOptimalTiming(
    category: EventCategory,
    location: string,
    duration: number,
    targetAudience?: string,
  ): Promise<OptimalTimingAnalysis> {
    const historicalData = await this.getHistoricalData(category, location);
    const seasonalPatterns = this.analyzeSeasonalPatterns(historicalData);
    const competitionAnalysis = await this.analyzeCompetitionInternal(category, location);
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
    if (!event) throw new BadRequestException('Event not found');
    const baselineAttendance = await this.calculateBaselineAttendance(event);
    const impactFactors = await this.calculateImpactFactors(event, newStartDate, newEndDate);
    const projectedAttendance = Math.round(
      baselineAttendance *
        impactFactors.timeOfYear *
        impactFactors.dayOfWeek *
        impactFactors.timeOfDay *
        impactFactors.competition *
        impactFactors.demographics,
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
      where: { category, location, startDate: Between(oneYearAgo, new Date()) },
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
        return { ...event, ticketsSold, revenue: Number(revenue?.total || 0) };
      }),
    );
  }

  private analyzeSeasonalPatterns(historicalData: any[]) {
    const monthlyPerformance = new Map<number, { attendance: number; revenue: number; count: number }>();
    historicalData.forEach((event) => {
      const month = new Date(event.startDate).getMonth();
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
    const consistency = this.calculateSeasonalConsistency(monthlyAverages);
    if (monthlyAverages.length === 0) {
      return { bestMonth: null, score: 0, consistency, monthlyData: monthlyAverages };
    }
    const bestMonth = monthlyAverages.reduce((best, current) =>
      current.avgAttendance > best.avgAttendance ? current : best,
    );
    const peakAttendance = Math.max(...monthlyAverages.map((m) => m.avgAttendance));
    return {
      bestMonth: bestMonth.month,
      score: peakAttendance > 0 ? bestMonth.avgAttendance / peakAttendance : 0,
      consistency,
      monthlyData: monthlyAverages,
    };
  }

  private async analyzeCompetitionInternal(category: EventCategory, location: string) {
    const nextThreeMonths = new Date();
    nextThreeMonths.setMonth(nextThreeMonths.getMonth() + 3);
    const competingEvents = await this.eventRepository.count({
      where: { category, location, startDate: Between(new Date(), nextThreeMonths) },
    });
    const level = competingEvents < 2 ? 'low' : competingEvents < 5 ? 'medium' : 'high';
    const score = competingEvents < 2 ? 1.0 : competingEvents < 5 ? 0.7 : 0.4;
    return { competingEvents, level, score, dataQuality: 0.8 };
  }

  private analyzeDemographicFactors(targetAudience?: string) {
    const demographicScores: Record<string, any> = {
      'young-adults': { weekends: 1.2, evenings: 1.3, score: 0.9 },
      families: { weekends: 1.4, afternoons: 1.2, score: 0.8 },
      professionals: { weekdays: 1.1, evenings: 1.2, score: 0.85 },
      seniors: { weekdays: 1.2, mornings: 1.3, score: 0.7 },
    };
    const profile = demographicScores[targetAudience ?? ''] ?? {
      weekends: 1.0,
      evenings: 1.0,
      score: 0.75,
    };
    return { targetAudience, preferences: profile, score: profile.score };
  }

  private calculateOptimalDate(
    seasonalPatterns: any,
    competitionAnalysis: any,
    demographicInsights: any,
    duration: number,
  ) {
    const now = new Date();
    let targetDate = new Date(now.getFullYear(), seasonalPatterns.bestMonth ?? now.getMonth(), 15);
    if (targetDate < now) targetDate.setFullYear(targetDate.getFullYear() + 1);
    if (demographicInsights.preferences.weekends > 1.1) {
      while (targetDate.getDay() !== 6) targetDate.setDate(targetDate.getDate() + 1);
    }
    return { start: targetDate, end: new Date(targetDate.getTime() + duration * 3600 * 1000) };
  }

  private calculateConfidence(dataPoints: number, seasonalConsistency: number, competitionDataQuality: number) {
    return (Math.min(dataPoints / 20, 1.0) + seasonalConsistency + competitionDataQuality) / 3;
  }

  private calculateSeasonalConsistency(monthlyAverages: any[]): number {
    if (monthlyAverages.length < 2) return 0.5;
    const attendances = monthlyAverages.map((m) => m.avgAttendance);
    const mean = attendances.reduce((s, v) => s + v, 0) / attendances.length;
    const variance = attendances.reduce((s, v) => s + (v - mean) ** 2, 0) / attendances.length;
    return Math.max(0, 1 - Math.sqrt(variance) / (mean || 1));
  }

  private calculateHistoricalScore(historicalData: any[]): number {
    if (historicalData.length === 0) return 0.5;
    const avgAtt = historicalData.reduce((s, e) => s + e.ticketsSold, 0) / historicalData.length;
    const avgRev = historicalData.reduce((s, e) => s + e.revenue, 0) / historicalData.length;
    return Math.min((avgAtt / 100 + avgRev / 1000) / 2, 1.0);
  }

  private generateReasoningExplanation(seasonalPatterns: any, competitionAnalysis: any, demographicInsights: any): string[] {
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const reasons: string[] = [];
    if (seasonalPatterns.bestMonth !== null) {
      reasons.push(`${monthNames[seasonalPatterns.bestMonth]} shows highest historical attendance`);
    }
    if (competitionAnalysis.level === 'low') reasons.push('Low competition period identified');
    else if (competitionAnalysis.level === 'high') reasons.push('High competition — consider alternative dates');
    if (demographicInsights.targetAudience) {
      reasons.push(`Optimised for ${demographicInsights.targetAudience} preferences`);
    }
    return reasons;
  }

  private async analyzeTimeSlot(timeSlot: { startDate: Date; endDate: Date }, category: EventCategory, location: string) {
    const seasonalFactor = this.getSeasonalFactor(timeSlot.startDate);
    const competitionLevel = await this.getCompetitionLevelInternal(timeSlot, category, location);
    const expectedAttendance = this.estimateAttendance(seasonalFactor, competitionLevel, category);
    return {
      expectedAttendance,
      revenueProjection: expectedAttendance * 50,
      competitionLevel: competitionLevel as 'low' | 'medium' | 'high',
      seasonalFactor,
      confidence: 0.7 + Math.random() * 0.3,
    };
  }

  private getSeasonalFactor(date: Date): number {
    const factors = [0.7,0.6,0.8,0.9,1.0,1.1,1.2,1.1,1.0,0.9,0.8,0.7];
    return factors[date.getMonth()];
  }

  private async getCompetitionLevelInternal(
    timeSlot: { startDate: Date; endDate: Date },
    category: EventCategory,
    location: string,
  ): Promise<string> {
    const count = await this.eventRepository.count({
      where: { category, location, startDate: Between(timeSlot.startDate, timeSlot.endDate) },
    });
    return count < 2 ? 'low' : count < 5 ? 'medium' : 'high';
  }

  private estimateAttendance(seasonalFactor: number, competitionLevel: string, _category: EventCategory): number {
    const mult = competitionLevel === 'low' ? 1.2 : competitionLevel === 'medium' ? 1.0 : 0.8;
    return Math.round(100 * seasonalFactor * mult);
  }

  private async calculateBaselineAttendance(event: Event): Promise<number> {
    const similar = await this.eventRepository.find({
      where: { category: event.category, organizerId: event.organizerId },
    });
    if (similar.length === 0) return 50;
    const counts = await Promise.all(
      similar.map((e) => this.ticketRepository.count({ where: { eventId: e.id, status: 'valid' } })),
    );
    return Math.round(counts.reduce((s, c) => s + c, 0) / counts.length);
  }

  private async calculateImpactFactors(event: Event, newStartDate: Date, newEndDate: Date) {
    return {
      timeOfYear: this.getSeasonalFactor(newStartDate),
      dayOfWeek: this.getDayOfWeekFactor(newStartDate),
      timeOfDay: this.getTimeOfDayFactor(newStartDate),
      competition: await this.getCompetitionFactor(event, newStartDate, newEndDate),
      demographics: 1.0,
    };
  }

  private getDayOfWeekFactor(date: Date): number {
    const d = date.getDay();
    return d === 0 || d === 6 ? 1.2 : 1.0;
  }

  private getTimeOfDayFactor(date: Date): number {
    const h = date.getHours();
    if (h >= 18 && h <= 21) return 1.3;
    if (h >= 14 && h <= 17) return 1.1;
    return 1.0;
  }

  private async getCompetitionFactor(event: Event, startDate: Date, endDate: Date): Promise<number> {
    const count = await this.eventRepository.count({
      where: { category: event.category, location: event.location, startDate: Between(startDate, endDate) },
    });
    return count < 2 ? 1.2 : count < 5 ? 1.0 : 0.8;
  }

  private identifyRiskFactors(impactFactors: any, date: Date): string[] {
    const risks: string[] = [];
    if (impactFactors.competition < 0.9) risks.push('High competition from similar events');
    if (impactFactors.timeOfYear < 0.8) risks.push('Low seasonal demand period');
    const d = date.getDay();
    if (d >= 1 && d <= 4) risks.push('Weekday scheduling may reduce attendance');
    return risks;
  }

  private identifyOpportunities(impactFactors: any, date: Date): string[] {
    const ops: string[] = [];
    if (impactFactors.competition > 1.1) ops.push('Low competition window identified');
    if (impactFactors.timeOfYear > 1.1) ops.push('Peak seasonal demand period');
    const d = date.getDay();
    if (d === 0 || d === 6) ops.push('Weekend scheduling advantage');
    return ops;
  }
}
