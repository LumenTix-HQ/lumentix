import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentsService } from '../payments.service';

@Injectable()
export class PaymentExpiryJob {
  private readonly logger = new Logger(PaymentExpiryJob.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  // Runs every 10 minutes — override with PAYMENT_EXPIRY_CRON env var if needed
  @Cron(process.env.PAYMENT_EXPIRY_CRON ?? CronExpression.EVERY_10_MINUTES)
  async expireStalePayments(): Promise<void> {
    this.logger.log('Running payment expiry job...');
    try {
      await this.paymentsService.expireStalePayments();
      this.logger.log('Payment expiry job completed successfully');
    } catch (error) {
      this.logger.error('Payment expiry job failed', error?.stack);
    }
  }
}