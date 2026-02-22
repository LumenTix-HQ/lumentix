import {
  Process,
  Processor,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
} from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';

@Processor('notifications')
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  @Process('sendTicketEmail')
  async handleTicketEmail(job: Job) {
    this.logger.log(`Sending ticket email for job ${job.id}...`);
    // Logic to call your Mailer service would go here
    await this.mockMailDelay(job.data);
    return { sent: true };
  }

  @Process('sendRefundEmail')
  async handleRefundEmail(job: Job) {
    this.logger.log(`Sending refund email for job ${job.id}...`);
    await this.mockMailDelay(job.data);
  }

  @Process('sendSponsorEmail')
  async handleSponsorEmail(job: Job) {
    this.logger.log(`Sending sponsor confirmation for job ${job.id}...`);
    await this.mockMailDelay(job.data);
  }

  // Monitor status
  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.id} failed: ${err.message}`);
  }

  private async mockMailDelay(data: any) {
    return new Promise((resolve) => setTimeout(resolve, 1500));
  }
}
