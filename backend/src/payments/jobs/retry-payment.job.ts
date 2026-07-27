import { Injectable, Logger } from '@nestjs/common';
import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { StellarService, PAYMENT_RETRY_QUEUE } from '../../stellar/stellar.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/entities/audit-log.entity';

export interface RetryPaymentJobData {
  paymentId: string;
}

/**
 * Resubmits a payment's persisted `signedXdr` after StellarService.sendPayment()
 * caught a transient Horizon timeout. Bull retries this job itself (up to
 * `attempts`, exponential backoff -- see StellarModule's queue registration)
 * on any thrown error; once the final attempt also fails, `handleFailed`
 * marks the payment FAILED and clears signedXdr.
 */
@Injectable()
@Processor(PAYMENT_RETRY_QUEUE)
export class RetryPaymentJob {
  private readonly logger = new Logger(RetryPaymentJob.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    private readonly stellarService: StellarService,
    private readonly auditService: AuditService,
  ) {}

  @Process('retry')
  async handle(job: Job<RetryPaymentJobData>): Promise<void> {
    const { paymentId } = job.data;
    const payment = await this.paymentsRepository.findOne({ where: { id: paymentId } });

    if (!payment) {
      this.logger.warn(`RetryPaymentJob: payment ${paymentId} not found, skipping`);
      return;
    }
    if (payment.status !== PaymentStatus.PENDING) {
      // Already resolved through another path (e.g. a concurrent confirmation) -- nothing to retry.
      return;
    }
    if (!payment.signedXdr) {
      this.logger.warn(`RetryPaymentJob: payment ${paymentId} has no signedXdr to retry`);
      return;
    }

    const response = await this.stellarService.submitTransaction(payment.signedXdr);

    payment.status = PaymentStatus.CONFIRMED;
    payment.transactionHash =
      typeof response.hash === 'string' ? response.hash : payment.transactionHash;
    payment.signedXdr = null;
    await this.paymentsRepository.save(payment);

    await this.auditService.log({
      action: AuditAction.PAYMENT_CONFIRMED,
      userId: payment.userId,
      resourceId: payment.id,
      meta: { retried: true, attempt: job.attemptsMade + 1 },
    });

    this.logger.log(`Payment ${paymentId} confirmed via retry (attempt ${job.attemptsMade + 1})`);
  }

  @OnQueueFailed()
  async handleFailed(job: Job<RetryPaymentJobData>, error: Error): Promise<void> {
    if (job.name !== 'retry') return;

    const maxAttempts = job.opts?.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      // Not the final attempt -- Bull will retry again after the backoff delay.
      return;
    }

    const { paymentId } = job.data;
    const payment = await this.paymentsRepository.findOne({ where: { id: paymentId } });
    if (!payment || payment.status !== PaymentStatus.PENDING) return;

    payment.status = PaymentStatus.FAILED;
    payment.signedXdr = null;
    await this.paymentsRepository.save(payment);

    await this.auditService.log({
      action: AuditAction.PAYMENT_FAILED,
      userId: payment.userId,
      resourceId: payment.id,
      meta: {
        reason: 'Retry attempts exhausted',
        attempts: job.attemptsMade,
        error: error.message,
      },
    });

    this.logger.error(
      `Payment ${paymentId} permanently failed after ${job.attemptsMade} attempt(s): ${error.message}`,
    );
  }
}
