import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class PaymentExpiryService {
  private readonly logger = new Logger(PaymentExpiryService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    private readonly auditService: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireStalePayments(): Promise<void> {
    const now = new Date();
    const stale = await this.paymentsRepository.createQueryBuilder('p')
      .where('p.status = :status', { status: PaymentStatus.PENDING })
      .andWhere('p.expiresAt < :now', { now })
      .getMany();

    if (stale.length === 0) {
      return;
    }

    for (const payment of stale) {
      payment.status = PaymentStatus.FAILED;
      await this.paymentsRepository.save(payment);
      await this.auditService.log({
        action: 'PAYMENT_EXPIRED',
        userId: payment.userId,
        resourceId: payment.id,
        meta: { eventId: payment.eventId, expiresAt: payment.expiresAt },
      });
    }

    this.logger.log(`Expired ${stale.length} stale payment intent(s)`);
  }
}
