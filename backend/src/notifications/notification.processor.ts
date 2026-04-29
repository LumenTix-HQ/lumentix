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
  ) { }

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
    const { email, ticketId, eventName, pdfUrl } = job.data;
    const subject = `Your ticket for ${eventName}`;
    const pdfLink = pdfUrl
      ? `<p><a href="${pdfUrl}" style="color: #007bff;">Download your PDF ticket</a></p>`
      : '';
    const html = `
      <div style="font-family: Arial, sans-serif;">
        <h2>Your Ticket for ${eventName}</h2>
        <p>Ticket ID: <strong>${ticketId}</strong></p>
        <p>Redeem your ticket <a href="https://lumentix.com/redeem/${ticketId}" style="color: #007bff;">here</a>.</p>
        ${pdfLink}
      </div>
    `;
    await this.mailerService.send(email, subject, html);
    return { sent: true };
  }

  @Process('sendTicketSoldEmail')
  async handleTicketSoldEmail(job: Job) {
    this.logger.log(`Sending ticket sold email for job ${job.id}...`);
    const { email, ticketId, amount, currency } = job.data;
    const subject = 'Your ticket has been sold';
    const html = `
      <div style="font-family: Arial, sans-serif;">
        <h2>Your Ticket Has Been Sold</h2>
        <p>Ticket ID: <strong>${ticketId}</strong></p>
        <p>Sale amount: <strong>${amount} ${currency}</strong></p>
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

  @Process('sendSponsorConfirmedEmail')
  async handleSponsorConfirmedEmail(job: Job) {
    this.logger.log(`Sending sponsor confirmed email for job ${job.id}...`);
    const { userId, email: providedEmail, sponsorName, eventTitle, amount, currency, transactionHash } = job.data;

    let email = providedEmail;
    if (userId && !email) {
      const user = await this.usersService.findById(userId);
      email = user.email;
    }

    if (!email) {
      this.logger.error(`No email found for sponsor confirmation job ${job.id}`);
      return;
    }

    const subject = `Sponsorship Confirmed: ${eventTitle}`;
    const html = `
      <div style="font-family: Arial, sans-serif;">
        <h2>Your Sponsorship Has Been Confirmed</h2>
        <p>Thank you, <strong>${sponsorName}</strong>, for sponsoring <strong>${eventTitle}</strong>!</p>
        <p>Amount: <strong>${amount} ${currency}</strong></p>
        <p>Transaction: <strong>${transactionHash}</strong></p>
      </div>
    `;
    await this.mailerService.send(email, subject, html);
    return { sent: true };
  }

  @Process('sendPaymentFailedEmail')
  async handlePaymentFailedEmail(job: Job) {
    // Payment failure is critical, no skip check
    this.logger.log(`Sending payment failed email for job ${job.id}...`);
    const { userId, email: providedEmail, eventTitle, amount, currency, reason } = job.data;

    let email = providedEmail;
    if (userId && !email) {
      const user = await this.usersService.findById(userId);
      email = user.email;
    }

    if (!email) {
      this.logger.error(`No email found for payment failure job ${job.id}`);
      return;
    }

    const subject = `Payment Failed: ${eventTitle}`;
    const html = `
      <div style="font-family: Arial, sans-serif;">
        <h2>Payment Could Not Be Processed</h2>
        <p>Your payment of <strong>${amount} ${currency}</strong> for <strong>${eventTitle}</strong> could not be confirmed.</p>
        <p>Reason: <strong>${reason}</strong></p>
        <p>Please try again or contact support if the issue persists.</p>
      </div>
    `;
    await this.mailerService.send(email, subject, html);
    return { sent: true };
  }

  @Process('sendEventCancelledEmail')
  async handleEventCancelledEmail(job: Job) {
    // Cancellation is critical, no skip check
    this.logger.log(`Sending event cancelled email for job ${job.id}...`);
    const { userId, eventTitle } = job.data;

    if (!userId) {
      this.logger.error(`No userId found for event cancellation job ${job.id}`);
      return;
    }

    const user = await this.usersService.findById(userId);
    if (!user || !user.email) {
      this.logger.error(`No email found for user ${userId} in cancellation job ${job.id}`);
      return;
    }

    const subject = `Event Cancelled: ${eventTitle}`;
    const html = `
      <div style="font-family: Arial, sans-serif;">
        <h2>Event Cancelled: ${eventTitle}</h2>
        <p>We regret to inform you that the event <strong>${eventTitle}</strong> has been cancelled.</p>
        <p>A refund will be processed for eligible tickets.</p>
      </div>
    `;
    await this.mailerService.send(user.email, subject, html);
    return { sent: true };
  }

  @Process('sendEventPublishedEmail')
  async handleEventPublishedEmail(job: Job) {
    if (await this.shouldSkip(job, 'eventPublished')) return;

    this.logger.log(`Sending event published email for job ${job.id}...`);
    const { organizerId, eventTitle } = job.data;

    if (!organizerId) {
      this.logger.error(`No organizerId found for event published job ${job.id}`);
      return;
    }

    const user = await this.usersService.findById(organizerId);
    if (!user || !user.email) {
      this.logger.error(`No email found for organizer ${organizerId} in published job ${job.id}`);
      return;
    }

    const subject = `Your Event is Live: ${eventTitle}`;
    const html = `
      <div style="font-family: Arial, sans-serif;">
        <h2>Your Event is Now Live!</h2>
        <p>Congratulations! Your event <strong>${eventTitle}</strong> has been published and is now accepting registrations.</p>
      </div>
    `;
    await this.mailerService.send(user.email, subject, html);
    return { sent: true };
  }

  @Process('sendEventCompletedEmail')
  async handleEventCompletedEmail(job: Job) {
    if (await this.shouldSkip(job, 'eventCompleted')) return;

    this.logger.log(`Sending event completed email for job ${job.id}...`);
    const { organizerId, eventTitle } = job.data;

    if (!organizerId) {
      this.logger.error(`No organizerId found for event completed job ${job.id}`);
      return;
    }

    const user = await this.usersService.findById(organizerId);
    if (!user || !user.email) {
      this.logger.error(`No email found for organizer ${organizerId} in completed job ${job.id}`);
      return;
    }

    const subject = `Event Completed: ${eventTitle}`;
    const html = `
      <div style="font-family: Arial, sans-serif;">
        <h2>Event Completed: ${eventTitle}</h2>
        <p>Your event <strong>${eventTitle}</strong> has been marked as completed. Thank you for hosting on Lumentix!</p>
      </div>
    `;
    await this.mailerService.send(user.email, subject, html);
    return { sent: true };
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
