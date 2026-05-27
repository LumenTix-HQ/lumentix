import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Event } from '../events/entities/event.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { Registration, RegistrationStatus } from '../registrations/entities/registration.entity';
import { AgeVerification } from '../age-verification/entities/age-verification.entity';
import { User } from '../users/entities/user.entity';

import {
  SalesReportDto,
  SalesDataPoint,
  SalesVelocityMetrics,
} from './dto/sales-report.dto';
import {
  DemographicsReportDto,
  DemographicBreakdown,
  AgeDistributionBucket,
  CurrencyBreakdown,
} from './dto/demographic-report.dto';
import {
  AttendancePatternDto,
  AttendanceDataPoint,
  AttendanceMetrics,
} from './dto/attendance-pattern.dto';
import {
  AnalyticsDashboardDto,
  QuickStats,
  RefundMetrics,
} from './dto/analytics-dashboard.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(TicketEntity)
    private readonly ticketRepository: Repository<TicketEntity>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Registration)
    private readonly registrationRepository: Repository<Registration>,
    @InjectRepository(AgeVerification)
    private readonly ageVerificationRepository: Repository<AgeVerification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async generateSalesReport(
    eventId: string,
    organizerId: string,
  ): Promise<SalesReportDto> {
    // Verify event and ownership
    const event = await this.eventRepository.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException(`Event with id "${eventId}" not found`);
    }
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('You are not the organizer of this event.');
    }

    // Fetch all confirmed payments for the event
    const payments = await this.paymentRepository.find({
      where: {
        eventId,
        status: PaymentStatus.CONFIRMED,
      },
      order: { createdAt: 'ASC' },
    });

    // Generate sales data points aggregated by hour
    const salesDataMap = new Map<string, SalesDataPoint>();
    let cumulativeTickets = 0;
    let cumulativeRevenue = 0;

    for (const payment of payments) {
      const hour = new Date(payment.createdAt);
      hour.setMinutes(0, 0, 0);
      const key = hour.toISOString();

      const existing = salesDataMap.get(key) || {
        timestamp: hour,
        ticketsSold: 0,
        revenue: 0,
        cumulativeTickets: 0,
        cumulativeRevenue: 0,
      };

      existing.ticketsSold += 1;
      existing.revenue += Number(payment.amount);
      cumulativeTickets += 1;
      cumulativeRevenue += Number(payment.amount);
      existing.cumulativeTickets = cumulativeTickets;
      existing.cumulativeRevenue = cumulativeRevenue;

      salesDataMap.set(key, existing);
    }

    const salesData = Array.from(salesDataMap.values());

    // Calculate metrics
    const metrics = this.calculateSalesVelocityMetrics(payments, event);

    const totalTicketsSold = payments.length;
    const totalRevenue = payments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const avgTicketPrice = totalTicketsSold > 0 ? totalRevenue / totalTicketsSold : 0;

    // Calculate days active
    const now = new Date();
    const daysActive = Math.ceil(
      (now.getTime() - event.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      salesData,
      metrics,
      totalTicketsSold,
      totalRevenue,
      avgTicketPrice,
      daysActive,
    };
  }

  private calculateSalesVelocityMetrics(
    payments: Payment[],
    event: Event,
  ): SalesVelocityMetrics {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const ticketsLast7Days = payments.filter((p) =>
      p.createdAt >= sevenDaysAgo,
    ).length;

    const ticketsLast24Hours = payments.filter((p) =>
      p.createdAt >= oneDayAgo,
    ).length;

    // Calculate average tickets per day
    const eventAgeDays = Math.max(
      1,
      Math.ceil(
        (now.getTime() - event.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );
    const avgTicketsPerDay = payments.length / eventAgeDays;

    // Calculate total revenue and average per day
    const totalRevenue = payments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const avgRevenuePerDay = totalRevenue / eventAgeDays;

    // Find peak sales hour
    const hourCounts = new Map<number, number>();
    const dayCounts = new Map<number, number>();

    for (const payment of payments) {
      const date = new Date(payment.createdAt);
      const hour = date.getHours();
      const day = date.getDay();
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    }

    let peakSalesHour: number | null = null;
    let peakHourCount = 0;
    for (const [hour, count] of hourCounts) {
      if (count > peakHourCount) {
        peakHourCount = count;
        peakSalesHour = hour;
      }
    }

    let peakSalesDayOfWeek: number | null = null;
    let peakDayCount = 0;
    for (const [day, count] of dayCounts) {
      if (count > peakDayCount) {
        peakDayCount = count;
        peakSalesDayOfWeek = day;
      }
    }

    // Determine trend
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (ticketsLast24Hours > avgTicketsPerDay * 1.2) {
      trend = 'increasing';
    } else if (ticketsLast24Hours < avgTicketsPerDay * 0.8) {
      trend = 'decreasing';
    }

    return {
      avgTicketsPerDay,
      avgRevenuePerDay,
      ticketsLast7Days,
      ticketsLast24Hours,
      peakSalesHour,
      peakSalesDayOfWeek,
      trend,
    };
  }

  async trackDemographicData(
    eventId: string,
    organizerId: string,
  ): Promise<DemographicsReportDto> {
    // Verify event and ownership
    const event = await this.eventRepository.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException(`Event with id "${eventId}" not found`);
    }
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('You are not the organizer of this event.');
    }

    // Get all registrations for the event
    const registrations = await this.registrationRepository.find({
      where: { eventId },
    });

    const confirmedRegistrations = registrations.filter(
      (r) =>
        r.status === RegistrationStatus.CONFIRMED ||
        r.status === RegistrationStatus.PENDING,
    );

    // Get age verifications
    const ageVerifications = await this.ageVerificationRepository.find({
      where: { eventId },
    });

    const demographics = this.analyzeAgeDemographics(ageVerifications);

    // Get currency breakdown
    const payments = await this.paymentRepository.find({
      where: {
        eventId,
        status: PaymentStatus.CONFIRMED,
      },
    });

    const currencyBreakdown = this.analyzeCurrencyBreakdown(
      payments,
      event.ticketPrice,
    );

    // Calculate repeat attendees (users who attended other events)
    const userIds = confirmedRegistrations.map((r) => r.userId);
    let repeatAttendeeCount = 0;

    if (userIds.length > 0) {
      const userEventCounts = await this.registrationRepository
        .createQueryBuilder('r')
        .select('r.userId', 'userId')
        .addSelect('COUNT(*)', 'eventCount')
        .where('r.userId IN (:...userIds)', { userIds })
        .andWhere('r.status = :status', { status: RegistrationStatus.CONFIRMED })
        .groupBy('r.userId')
        .having('COUNT(*) > 1')
        .getRawMany();

      repeatAttendeeCount = userEventCounts.length;
    }

    return {
      demographics,
      currencyBreakdown,
      totalAttendees: confirmedRegistrations.length,
      totalRegistrations: registrations.length,
      repeatAttendeeCount,
      repeatAttendeePercentage:
        confirmedRegistrations.length > 0
          ? (repeatAttendeeCount / confirmedRegistrations.length) * 100
          : 0,
    };
  }

  private analyzeAgeDemographics(
    ageVerifications: AgeVerification[],
  ): DemographicBreakdown {
    const today = new Date();
    const ages: number[] = [];
    const ageBuckets = new Map<string, number>();

    // Define age ranges
    const ranges = [
      { min: 0, max: 17, label: '0-17' },
      { min: 18, max: 24, label: '18-24' },
      { min: 25, max: 34, label: '25-34' },
      { min: 35, max: 44, label: '35-44' },
      { min: 45, max: 54, label: '45-54' },
      { min: 55, max: 64, label: '55-64' },
      { min: 65, max: 150, label: '65+' },
    ];

    // Initialize buckets
    for (const range of ranges) {
      ageBuckets.set(range.label, 0);
    }

    // Calculate ages and bucket them
    for (const verification of ageVerifications) {
      if (verification.dateOfBirth && verification.status === 'verified') {
        const birthDate = new Date(verification.dateOfBirth);
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }

        ages.push(age);

        // Find and increment the appropriate bucket
        for (const range of ranges) {
          if (age >= range.min && age <= range.max) {
            ageBuckets.set(range.label, ageBuckets.get(range.label)! + 1);
            break;
          }
        }
      }
    }

    const totalVerified = ages.length;
    const verifiedAges: AgeDistributionBucket[] = [];

    for (const [label, count] of ageBuckets) {
      verifiedAges.push({
        ageRange: label,
        count,
        percentage: totalVerified > 0 ? (count / totalVerified) * 100 : 0,
      });
    }

    // Sort by age range
    verifiedAges.sort((a, b) => {
      const aMin = parseInt(a.ageRange.split('-')[0]);
      const bMin = parseInt(b.ageRange.split('-')[0]);
      return aMin - bMin;
    });

    const averageAge = ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : null;
    const minAge = ages.length > 0 ? Math.min(...ages) : null;
    const maxAge = ages.length > 0 ? Math.max(...ages) : null;

    return {
      verifiedAges,
      ageVerificationRate:
        ageVerifications.length > 0
          ? (totalVerified / ageVerifications.length) * 100
          : 0,
      averageAge: averageAge ? Math.round(averageAge * 10) / 10 : null,
      minAge,
      maxAge,
    };
  }

  private analyzeCurrencyBreakdown(
    payments: Payment[],
    eventTicketPrice: number,
  ): CurrencyBreakdown[] {
    const currencyMap = new Map<string, { tickets: number; amount: number }>();

    for (const payment of payments) {
      const currency = payment.currency || 'XLM';
      const existing = currencyMap.get(currency) || {
        tickets: 0,
        amount: 0,
      };
      existing.tickets += 1;
      existing.amount += Number(payment.amount);
      currencyMap.set(currency, existing);
    }

    const totalTickets = payments.length;
    const result: CurrencyBreakdown[] = [];

    for (const [currency, data] of currencyMap) {
      result.push({
        currency,
        ticketCount: data.tickets,
        totalAmount: data.amount,
        percentage: totalTickets > 0 ? (data.tickets / totalTickets) * 100 : 0,
      });
    }

    // Sort by ticket count descending
    result.sort((a, b) => b.ticketCount - a.ticketCount);

    return result;
  }

  async analyzeAttendancePatterns(
    eventId: string,
    organizerId: string,
  ): Promise<AttendancePatternDto | null> {
    // Verify event and ownership
    const event = await this.eventRepository.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException(`Event with id "${eventId}" not found`);
    }
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('You are not the organizer of this event.');
    }

    // Get all used tickets (check-ins)
    const usedTickets = await this.ticketRepository.find({
      where: {
        eventId,
        status: 'used',
      },
      order: { createdAt: 'ASC' },
    });

    // If no used tickets, return null (event hasn't started or no check-ins yet)
    if (usedTickets.length === 0) {
      return null;
    }

    // Get all tickets for the event
    const allTickets = await this.ticketRepository.find({
      where: { eventId },
    });

    // Generate hourly check-in data
    const hourlyMap = new Map<number, AttendanceDataPoint>();
    let cumulativeCheckIns = 0;

    const eventStart = event.startDate;
    const hours = new Map<number, number>();

    for (const ticket of usedTickets) {
      const checkInTime = new Date(ticket.createdAt);
      const eventHour = Math.floor(
        (checkInTime.getTime() - eventStart.getTime()) / (1000 * 60 * 60),
      );
      const clampedHour = Math.max(0, eventHour); // Don't go below hour 0

      hours.set(clampedHour, (hours.get(clampedHour) ?? 0) + 1);
    }

    // Create hourly data points
    const hourlyCheckIns: AttendanceDataPoint[] = [];
    let maxHour = 0;

    for (const [hour, count] of hours) {
      cumulativeCheckIns += count;
      hourlyCheckIns.push({
        timestamp: new Date(
          eventStart.getTime() + hour * 60 * 60 * 1000,
        ),
        checkInCount: count,
        cumulativeCheckIns,
        hour,
      });
      maxHour = Math.max(maxHour, hour);
    }

    // Fill in missing hours with 0 check-ins
    for (let h = 0; h <= maxHour; h++) {
      if (!hours.has(h)) {
        const lastCumulative = hourlyCheckIns.find((d) => d.hour === h - 1)
          ?.cumulativeCheckIns ?? 0;
        hourlyCheckIns.push({
          timestamp: new Date(
            eventStart.getTime() + h * 60 * 60 * 1000,
          ),
          checkInCount: 0,
          cumulativeCheckIns: lastCumulative,
          hour: h,
        });
      }
    }

    // Sort by hour
    hourlyCheckIns.sort((a, b) => a.hour - b.hour);

    // Calculate metrics
    const metrics = this.calculateAttendanceMetrics(
      usedTickets,
      hourlyCheckIns,
      eventStart,
    );

    const eventDurationHours = maxHour + 1;
    const ticketsUsed = usedTickets.length;
    const ticketsUnused = allTickets.length - ticketsUsed;
    const lastCheckInTime =
      usedTickets.length > 0
        ? new Date(usedTickets[usedTickets.length - 1].createdAt)
        : null;

    return {
      eventDurationHours,
      hourlyCheckIns,
      metrics,
      totalTicketsIssued: allTickets.length,
      ticketsUsed,
      ticketsUnused,
      eventStartTime: eventStart,
      lastCheckInTime,
    };
  }

  private calculateAttendanceMetrics(
    usedTickets: TicketEntity[],
    hourlyCheckIns: AttendanceDataPoint[],
    eventStart: Date,
  ): AttendanceMetrics {
    let peakCheckInHour: number | null = null;
    let peakCheckInCount = 0;

    for (const hour of hourlyCheckIns) {
      if (hour.checkInCount > peakCheckInCount) {
        peakCheckInCount = hour.checkInCount;
        peakCheckInHour = hour.hour;
      }
    }

    const totalCheckIns = usedTickets.length;

    // Calculate average check-in interval
    let avgCheckInInterval: number | null = null;
    if (usedTickets.length > 1) {
      const firstCheckIn = usedTickets[0].createdAt;
      const lastCheckIn = usedTickets[usedTickets.length - 1].createdAt;
      const totalMinutes = (lastCheckIn.getTime() - firstCheckIn.getTime()) / (1000 * 60);
      avgCheckInInterval = totalMinutes / (usedTickets.length - 1);
    }

    // Calculate peak check-in rate (check-ins per minute)
    let peakCheckInRate: number | null = null;
    if (peakCheckInCount > 0) {
      // Assume peak hour = 60 minutes
      peakCheckInRate = peakCheckInCount / 60;
    }

    return {
      peakCheckInHour,
      peakCheckInCount,
      totalCheckIns,
      attendanceRate: usedTickets.length, // Will be calculated in dashboard
      avgCheckInInterval,
      peakCheckInRate,
      estimatedCapacityFilled: null, // Will be set in dashboard
    };
  }

  async generateAnalyticsDashboard(
    eventId: string,
    organizerId: string,
  ): Promise<AnalyticsDashboardDto> {
    // Verify event and ownership
    const event = await this.eventRepository.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException(`Event with id "${eventId}" not found`);
    }
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('You are not the organizer of this event.');
    }

    // Get all required data in parallel
    const [salesReport, demographics, attendance, allPayments, allTickets, allRegistrations] = await Promise.all([
      this.generateSalesReport(eventId, organizerId),
      this.trackDemographicData(eventId, organizerId),
      this.analyzeAttendancePatterns(eventId, organizerId),
      this.paymentRepository.find({ where: { eventId } }),
      this.ticketRepository.find({ where: { eventId } }),
      this.registrationRepository.find({ where: { eventId } }),
    ]);

    // Calculate refund metrics
    const refundedPayments = allPayments.filter((p) => p.status === PaymentStatus.REFUNDED);
    const totalRefunds = refundedPayments.length;
    const totalRefundAmount = refundedPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const refundRate =
      allPayments.length > 0 ? (totalRefunds / allPayments.length) * 100 : 0;

    const avgRefundAmount = totalRefunds > 0 ? totalRefundAmount / totalRefunds : 0;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const refundsLast7Days = refundedPayments.filter((p) =>
      p.updatedAt >= sevenDaysAgo,
    ).length;

    const refunds: RefundMetrics = {
      totalRefunds,
      totalRefundAmount,
      refundRate,
      avgRefundAmount,
      mostCommonReason: null, // Could be enhanced with refund reason tracking
      refundsLast7Days,
    };

    // Calculate quick stats
    const confirmedPayments = allPayments.filter(
      (p) => p.status === PaymentStatus.CONFIRMED,
    );
    const usedTickets = allTickets.filter((t) => t.status === 'used');
    const confirmedRegistrations = allRegistrations.filter(
      (r) =>
        r.status === RegistrationStatus.CONFIRMED ||
        r.status === RegistrationStatus.PENDING,
    );

    const totalRevenue = confirmedPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const attendanceRate =
      allTickets.length > 0 ? (usedTickets.length / allTickets.length) * 100 : 0;

    // Determine trends
    const last24HoursSales = confirmedPayments.filter((p) => {
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return p.createdAt >= oneDayAgo;
    }).length;

    const last7DaysSales = confirmedPayments.filter((p) => {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return p.createdAt >= sevenDaysAgo;
    }).length;

    const avgDailySales = last7DaysSales / 7;
    const salesTrend =
      last24HoursSales > avgDailySales * 1.2
        ? 'up'
        : last24HoursSales < avgDailySales * 0.8
          ? 'down'
          : 'stable';

    const last24HoursRevenue = confirmedPayments
      .filter((p) => {
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        return p.createdAt >= oneDayAgo;
      })
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const last7DaysRevenue = confirmedPayments
      .filter((p) => {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return p.createdAt >= sevenDaysAgo;
      })
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const avgDailyRevenue = last7DaysRevenue / 7;
    const revenueTrend =
      last24HoursRevenue > avgDailyRevenue * 1.2
        ? 'up'
        : last24HoursRevenue < avgDailyRevenue * 0.8
          ? 'down'
          : 'stable';

    const quickStats: QuickStats = {
      ticketsSold: confirmedPayments.length,
      totalRevenue,
      attendanceCount: usedTickets.length,
      attendanceRate,
      avgTicketPrice:
        confirmedPayments.length > 0
          ? totalRevenue / confirmedPayments.length
          : 0,
      totalRefunds,
      refundRate,
      revenueTrend,
      salesTrend,
    };

    return {
      eventId,
      lastUpdated: new Date(),
      quickStats,
      salesReport,
      demographics,
      attendance,
      refunds,
    };
  }
}
