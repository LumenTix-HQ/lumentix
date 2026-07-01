import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { RefundService } from '../../payments/refunds/refund.service';
import { Logger } from '@nestjs/common';

@Processor('events')
export class CancelEventProcessor {
  private readonly logger = new Logger(CancelEventProcessor.name);

  constructor(private readonly refundService: RefundService) {}

  @Process('cancel-event')
  async handleCancelEvent(job: Job<{ eventId: string }>) {
    const { eventId } = job.data;
    this.logger.log(`Starting refund process for event ${eventId}`);
    try {
      await this.refundService.refundAllForEvent(eventId);
      this.logger.log(`Successfully processed refunds for event ${eventId}`);
    } catch (error) {
      this.logger.error(`Failed to process refunds for event ${eventId}`, error.stack);
      throw error;
    }
  }
}