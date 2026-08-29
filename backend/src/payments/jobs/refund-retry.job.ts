import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class RefundRetryJob {
  private readonly logger = new Logger(RefundRetryJob.name);

  async processRefundRetry(paymentId: string, attempt: number): Promise<void> {
    this.logger.log(`Retrying Horizon refund for payment ${paymentId} (Attempt ${attempt}/3)`);
  }
}
