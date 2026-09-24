import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bull';
import * as nodemailer from 'nodemailer';
import { MailerService } from './mailer.service';
import { TemplateService } from '../common/mailer/template.service';

jest.mock('nodemailer');

// Regression tests for the hardcoded `secure: false`, which breaks implicit
// TLS on port 465 (Gmail, SendGrid SMTP over 465, etc.) regardless of
// SMTP_PORT.
describe('MailerService transporter TLS configuration', () => {
  const createTransportMock = nodemailer.createTransport as jest.Mock;

  beforeEach(() => {
    createTransportMock.mockClear();
    createTransportMock.mockReturnValue({ sendMail: jest.fn() });
  });

  async function buildService(config: Record<string, unknown>) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailerService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => config[key]) },
        },
        { provide: TemplateService, useValue: { render: jest.fn() } },
        { provide: getQueueToken('email'), useValue: { add: jest.fn() } },
      ],
    }).compile();

    return module.get<MailerService>(MailerService);
  }

  it('uses secure: true for implicit-TLS port 465', async () => {
    await buildService({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 465,
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
      MAIL_FROM: 'noreply@example.com',
    });

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });

  it('uses secure: false for STARTTLS port 587', async () => {
    await buildService({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 587,
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
      MAIL_FROM: 'noreply@example.com',
    });

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587, secure: false }),
    );
  });

  it('lets an explicit SMTP_SECURE override the port-based default', async () => {
    await buildService({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 587,
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
      MAIL_FROM: 'noreply@example.com',
      SMTP_SECURE: 'true',
    });

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587, secure: true }),
    );
  });
});
