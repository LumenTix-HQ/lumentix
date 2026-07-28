import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { MailerService } from '../mailer.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Processor('email')
export class SendEmailProcessor {
  private readonly logger = new Logger(SendEmailProcessor.name);

  constructor(
    private readonly mailerService: MailerService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @Process('send')
  async handleSend(job: Job<{ userId?: string; to: string; subject: string; html: string }>) {
    const { userId, to, subject, html } = job.data;

    // Check user opt-out preference if userId is provided
    if (userId) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (user && user.notificationPreferences) {
        const prefs = user.notificationPreferences as Record<string, boolean>;
        if (prefs.emailOptOut === true) {
          this.logger.debug(`Skipping email for user ${userId}: opted out`);
          return;
        }
      }
    }

    this.logger.debug(`Sending email: to=${to} subject="${subject}"`);
    await this.mailerService.send(to, subject, html);
    this.logger.log(`Email sent: to=${to}`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `Email job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
      error.stack,
    );
  }
}
