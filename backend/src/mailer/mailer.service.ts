import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { TemplateService } from '../common/mailer/template.service';

export interface SendMailOptions {
  to: string;
  subject: string;
  /** Raw HTML body. If `template` is also provided, `html` is ignored. */
  html?: string;
  /** Handlebars template name (without `.hbs` extension). */
  template?: string;
  /** Context variables injected into the Handlebars template. */
  context?: Record<string, unknown>;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly mailFrom: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly templateService: TemplateService,
  ) {
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

  /**
   * Send an email.
   *
   * Supports two usage patterns (backward-compatible):
   *
   * 1. **Template mode** — pass `template` + optional `context`:
   *    ```ts
   *    await mailerService.send(to, subject, { template: 'password-reset', context: { resetUrl } });
   *    ```
   * 2. **Raw HTML mode** — pass an HTML string as the third argument (legacy):
   *    ```ts
   *    await mailerService.send(to, subject, '<p>Hello</p>');
   *    ```
   */
  async send(
    to: string,
    subject: string,
    htmlOrOptions: string | Omit<SendMailOptions, 'to' | 'subject'>,
  ): Promise<void> {
    let html: string;

    if (typeof htmlOrOptions === 'string') {
      // Legacy call-site: raw HTML string passed directly
      html = htmlOrOptions;
    } else {
      const { template, context = {}, html: rawHtml } = htmlOrOptions;
      if (template) {
        html = await this.templateService.render(template, context);
      } else if (rawHtml) {
        html = rawHtml;
      } else {
        html = '';
      }
    }

    await this.transporter.sendMail({
      from: this.mailFrom,
      to,
      subject,
      html,
    });
  }
}
