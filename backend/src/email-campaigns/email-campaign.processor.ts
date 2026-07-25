import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { MailerService } from '../mailer/mailer.service';

interface DeliverEmailJob {
  campaignId: string;
  organizerId: string;
  to: string;
  subject: string;
  bodyHtml: string;
}

@Processor('email-campaigns')
export class EmailCampaignProcessor {
  private readonly logger = new Logger(EmailCampaignProcessor.name);

  constructor(private readonly mailerService: MailerService) {}

  @Process('deliverEmail')
  async handleDeliverEmail(job: Job<DeliverEmailJob>): Promise<void> {
    const { campaignId, to, subject, bodyHtml } = job.data;
    try {
      await this.mailerService.send({ to, subject, html: bodyHtml });
      this.logger.debug(`Campaign ${campaignId}: delivered to ${to}`);
    } catch (error) {
      this.logger.error(
        `Campaign ${campaignId}: failed to deliver to ${to} — ${(error as Error).message}`,
      );
      throw error; // let Bull retry
    }
  }
}
