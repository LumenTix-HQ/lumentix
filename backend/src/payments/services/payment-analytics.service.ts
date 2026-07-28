
import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { subDays, format } from 'date-fns';

@Injectable()
export class PaymentAnalyticsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async getEventAnalytics(eventId: string): Promise<any> {
    const cacheKey = `payment-analytics:${eventId}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const analytics = await this.calculateAnalytics(eventId);
    await this.cacheManager.set(cacheKey, analytics, 300); // Cache for 5 minutes
    return analytics;
  }

  private async calculateAnalytics(eventId: string) {
    const qb = this.paymentRepository.createQueryBuilder('payment');

    const [
      totalRevenue,
      statusCounts,
      revenueByDay,
      topCurrencies,
    ] = await Promise.all([
      this.getTotalRevenue(qb, eventId),
      this.getStatusCounts(qb, eventId),
      this.getRevenueByDay(qb, eventId),
      this.getTopCurrencies(qb, eventId),
    ]);

    return {
      totalRevenue,
      ...statusCounts,
      revenueByDay,
      topCurrencies,
    };
  }

  private async getTotalRevenue(qb, eventId) {
    return qb
      .select('SUM(payment.amount)', 'total')
      .where('payment.eventId = :eventId', { eventId })
      .andWhere('payment.status = :status', { status: PaymentStatus.CONFIRMED })
      .getRawOne()
      .then((result) => Number(result.total) || 0);
  }

  private async getStatusCounts(qb, eventId) {
    const counts = await qb
      .select('payment.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('payment.eventId = :eventId', { eventId })
      .groupBy('payment.status')
      .getRawMany();

    return counts.reduce(
      (acc, { status, count }) => ({
        ...acc,
        [`${status.toLowerCase()}Count`]: Number(count),
      }),
      {
        confirmedCount: 0,
        refundedCount: 0,
        pendingCount: 0,
        failedCount: 0,
      },
    );
  }

  private async getRevenueByDay(qb, eventId) {
    const thirtyDaysAgo = subDays(new Date(), 30);
    const dailyData = await qb
      .select("DATE_TRUNC('day', payment.createdAt)", 'date')
      .addSelect('SUM(payment.amount)', 'amount')
      .where('payment.eventId = :eventId', { eventId })
      .andWhere('payment.createdAt >= :thirtyDaysAgo', { thirtyDaysAgo })
      .andWhere('payment.status = :status', { status: PaymentStatus.CONFIRMED })
      .groupBy("DATE_TRUNC('day', payment.createdAt)")
      .orderBy("DATE_TRUNC('day', payment.createdAt)")
      .getRawMany();

    return this.fillMissingDays(dailyData, thirtyDaysAgo);
  }

  private async getTopCurrencies(qb, eventId) {
    return qb
      .select('payment.currency', 'currency')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(payment.amount)', 'total')
      .where('payment.eventId = :eventId', { eventId })
      .groupBy('payment.currency')
      .orderBy('count', 'DESC')
      .limit(5)
      .getRawMany();
  }

  private fillMissingDays(data, startDate) {
    const dateMap = new Map(
      data.map((item) => [format(new Date(item.date), 'yyyy-MM-dd'), item.amount]),
    );
    const result = [];
    for (let i = 0; i < 30; i++) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
      result.push({
        date,
        amount: Number(dateMap.get(date)) || 0,
      });
    }
    return result.reverse();
  }
}