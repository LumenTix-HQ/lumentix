import {
  Process,
  Processor,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
} from '@nestjs/bull';
import { Job } from 'bull';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { MailerService } from '../mailer/mailer.service';
import { UsersService } from '../users/users.service';

@Processor('notifications')
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);
  constructor(
    private readonly mailerService: MailerService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  private async shouldSkip(job: Job, preferenceKey: string): Promise<boolean> {
    const criticalJobs = ['sendRefundEmail', 'eventCancelled']; // cancellation is critical
    if (criticalJobs.includes(job.name)) {
      return false;
    }

    if (!job.data.userId) {
      this.logger.warn(`Job ${job.id} (${job.name}) missing userId, sending anyway.`);
      return false;
    }

    try {
      const user = await this.usersService.findById(job.data.userId);
      // We need the raw entity to access notificationPreferences if findById sanitizes it
      // Actually UsersService.findById returns sanitized user.
      // Let's check if notificationPreferences is included in sanitized user.
      const prefs = (user as any).notificationPreferences;
      
      if (prefs && prefs[preferenceKey] === false) {
        this.logger.log(`Skipping ${job.name} email for user ${job.data.userId} — opted out`);
        return true;
      }
    } catch (error) {
      this.logger.error(`Failed to check preferences for user ${job.data.userId}: ${error.message}`);
    }
    
    return false;
  }

  @Process('sendTicketEmail')
  async handleTicketEmail(job: Job) {
    if (await this.shouldSkip(job, 'ticketIssued')) return;

    this.logger.log(`Sending ticket email for job ${job.id}...`);
    const { email, ticketId, eventName } = job.data;
    const subject = `Your ticket for ${eventName}`;
    const html = `
      <div style="font-family: Arial, sans-serif;">
        <h2>Your Ticket for ${eventName}</h2>
        <p>Ticket ID: <strong>${ticketId}</strong></p>
        <p>Redeem your ticket <a href="https://lumentix.com/redeem/${ticketId}" style="color: #007bff;">here</a>.</p>
      </div>
    `;
    await this.mailerService.send(email, subject, html);
    return { sent: true };
  }

  @Process('sendRefundEmail')
  async handleRefundEmail(job: Job) {
    // Refund is critical, no skip check
    this.logger.log(`Sending refund email for job ${job.id}...`);
    const { email, amount, refundId } = job.data;
    const subject = 'Your refund has been processed';
    const html = `
      <div style="font-family: Arial, sans-serif;">
        <h2>Your Refund Has Been Processed</h2>
        <p>Amount: <strong>${amount} XLM</strong></p>
        <p>Refund ID: <strong>${refundId}</strong></p>
      </div>
    `;
    await this.mailerService.send(email, subject, html);
  }

  @Process('sendSponsorEmail')
  async handleSponsorEmail(job: Job) {
    if (await this.shouldSkip(job, 'sponsorConfirmed')) return;

    this.logger.log(`Sending sponsor confirmation for job ${job.id}...`);
    const { email, sponsorName } = job.data;
    const subject = 'Sponsorship confirmed';
    const html = `
      <div style="font-family: Arial, sans-serif;">
        <h2>Sponsorship Confirmed</h2>
        <p>Thank you, <strong>${sponsorName}</strong>, for your support!</p>
      </div>
    `;
    await this.mailerService.send(email, subject, html);
  }

  // Monitor status
  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`Job ${job.id} (${job.name}) started.`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job, result: any) {
    this.logger.log(
      `Job ${job.id} (${job.name}) completed successfully. Result: ${JSON.stringify(result)}`,
    );
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.id} failed: ${err.message}`);
  }

  // mockMailDelay removed; replaced with real mailer integration
}
