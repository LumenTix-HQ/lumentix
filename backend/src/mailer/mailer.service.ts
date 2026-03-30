import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly mailFrom: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    this.mailFrom = this.configService.get<string>('MAIL_FROM') ?? '';

    if (!host || !port || !user || !pass || !this.mailFrom) {
      this.logger.warn('Missing SMTP configuration environment variables.');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      auth: { user, pass },
      secure: false,
    });
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.mailFrom,
      to,
      subject,
      html,
    });
  }
}
