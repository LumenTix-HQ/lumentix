import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../entities/payment.entity';

export interface PaymentAnalyticsResponse {
  totalRevenue: number;
  confirmedCount: number;
  refundedCount: number;
  pendingCount: number;
  failedCount: number;
  revenueByDay: { date: string; amount: number }[];
  topCurrencies: { currency: string; count: number; total: number }[];
}

@Injectable()
export class PaymentAnalyticsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
  ) {}

  async getEventPaymentAnalytics(
    eventId: string,
    requesterId: string,
  ): Promise<PaymentAnalyticsResponse> {
    // Verify requester is the organizer by joining to events
    const ownerCheck = await this.paymentRepo
      .createQueryBuilder('p')
      .innerJoin('events', 'e', 'e.id = p."eventId"')
      .where('p."eventId" = :eventId', { eventId })
      .andWhere('e."organizerId" != :requesterId', { requesterId })
      .getCount();

    if (ownerCheck > 0) {
      throw new ForbiddenException('Only the event organizer can view payment analytics');
    }

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [statusRows, revenueByDayRows, topCurrencyRows] = await Promise.all([
      this.paymentRepo
        .createQueryBuilder('p')
        .select('p.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(p.amount), 0)', 'total')
        .where('p."eventId" = :eventId', { eventId })
        .groupBy('p.status')
        .getRawMany(),

      this.paymentRepo
        .createQueryBuilder('p')
        .select('DATE(p."createdAt")', 'date')
        .addSelect('SUM(p.amount)', 'amount')
        .where('p."eventId" = :eventId AND p.status = :status AND p."createdAt" >= :since', {
          eventId,
          status: 'confirmed',
          since,
        })
        .groupBy('DATE(p."createdAt")')
        .orderBy('DATE(p."createdAt")', 'ASC')
        .getRawMany(),

      this.paymentRepo
        .createQueryBuilder('p')
        .select('p.currency', 'currency')
        .addSelect('COUNT(*)', 'count')
        .addSelect('SUM(p.amount)', 'total')
        .where('p."eventId" = :eventId AND p.status = :status', { eventId, status: 'confirmed' })
        .groupBy('p.currency')
        .orderBy('SUM(p.amount)', 'DESC')
        .getRawMany(),
    ]);

    const byStatus = (s: string) => statusRows.find((r) => r.status === s);

    return {
      totalRevenue: Number(byStatus('confirmed')?.total ?? 0),
      confirmedCount: Number(byStatus('confirmed')?.count ?? 0),
      refundedCount: Number(byStatus('refunded')?.count ?? 0),
      pendingCount: Number(byStatus('pending')?.count ?? 0),
      failedCount: Number(byStatus('failed')?.count ?? 0),
      revenueByDay: revenueByDayRows.map((r) => ({
        date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date),
        amount: Number(r.amount),
      })),
      topCurrencies: topCurrencyRows.map((r) => ({
        currency: r.currency,
        count: Number(r.count),
        total: Number(r.total),
      })),
    };
  }
}
