import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { AuditService } from '../../audit/audit.service';
import { NotificationService } from '../../notifications/notification.service';

@Injectable()
export class PaymentExpiryJob {
  private readonly logger = new Logger(PaymentExpiryJob.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireStalePayments(): Promise<void> {
    this.logger.log('Running payment expiry job...');

    const expired = await this.paymentsRepository.find({
      where: {
        status: PaymentStatus.PENDING,
        expiresAt: LessThan(new Date()),
      },
    });

    if (expired.length === 0) {
      this.logger.log('No stale payment intents to expire.');
      return;
    }

    this.logger.log(`Expiring ${expired.length} stale payment intent(s).`);

    for (const payment of expired) {
      payment.status = PaymentStatus.FAILED;
      await this.paymentsRepository.save(payment);

      await this.auditService.log({
        action: 'PAYMENT_EXPIRED',
        userId: payment.userId,
        resourceId: payment.id,
        meta: { eventId: payment.eventId, expiredAt: payment.expiresAt },
      });
    }

    this.logger.log('Payment expiry job completed.');
  }
}
