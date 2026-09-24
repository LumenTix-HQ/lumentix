import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as nodemailer from 'nodemailer';
import { TemplateService } from '../common/mailer/template.service';

export interface SendMailAttachment {
  filename: string;
  /** Raw attachment content (e.g. an .ics file's text). */
  content: string;
  contentType?: string;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  /** Raw HTML body. If `template` is also provided, `html` is ignored. */
  html?: string;
  /** Handlebars template name (without `.hbs` extension). */
  template?: string;
  /** Context variables injected into the Handlebars template. */
  context?: Record<string, unknown>;
  attachments?: SendMailAttachment[];
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly mailFrom: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly templateService: TemplateService,
    @InjectQueue('email') private readonly emailQueue: Queue,
  ) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    this.mailFrom = this.configService.get<string>('MAIL_FROM') ?? '';

    if (!host || !port || !user || !pass || !this.mailFrom) {
      this.logger.warn('Missing SMTP configuration environment variables.');
    }

    // Port 465 is implicit TLS and requires `secure: true`; 587/25 use
    // STARTTLS and expect `secure: false`. An explicit SMTP_SECURE env var
    // can still override this for providers that don't follow that
    // convention.
    const secureOverride = this.configService.get<string>('SMTP_SECURE');
    const secure = secureOverride !== undefined ? secureOverride === 'true' : port === 465;

    if (port === 465 && !secure) {
      this.logger.warn(
        'SMTP_PORT is 465 (implicit TLS) but SMTP_SECURE=false was set explicitly — this will likely fail to connect.',
      );
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      auth: { user, pass },
      secure,
    });
  }

  async send(options: SendMailOptions): Promise<void> {
    const html = this.templateService.render(options.template, {
      ...options.context,
      subject: options.subject,
    });

    await this.transporter.sendMail({
      from: this.mailFrom,
      to: options.to,
      subject: options.subject,
      html,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
  }

  /**
   * Enqueue an email for async delivery via Bull.
   *
   * The `SendEmailProcessor` will pick it up and check the user's
   * `emailOptOut` preference before actually sending.
   */
  async queueEmail(
    to: string,
    subject: string,
    htmlOrOptions: string | Omit<SendMailOptions, 'to' | 'subject'>,
    opts?: { userId?: string; delay?: number },
  ): Promise<void> {
    let html: string;

    if (typeof htmlOrOptions === 'string') {
      html = htmlOrOptions;
    } else {
      const { template, context = {}, html: rawHtml } = htmlOrOptions;
      if (template) {
        html = this.templateService.render(template, context);
      } else if (rawHtml) {
        html = rawHtml;
      } else {
        html = '';
      }
    }

    const jobOpts = {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5000 },
      removeOnComplete: true,
      ...(opts?.delay ? { delay: opts.delay } : {}),
    };

    await this.emailQueue.add(
      'send',
      { userId: opts?.userId, to, subject, html },
      jobOpts,
    );

    this.logger.debug(`Email queued for ${to}: "${subject}"`);
  }
}
