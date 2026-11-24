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

describe('MailerService.send options', () => {
  const sendMail = jest.fn().mockResolvedValue(undefined);
  const render = jest.fn().mockReturnValue('<p>rendered</p>');

  async function buildService() {
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              ({ SMTP_HOST: 'h', SMTP_PORT: 587, SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'from@example.com' })[key],
            ),
          },
        },
        { provide: TemplateService, useValue: { render } },
        { provide: getQueueToken('email'), useValue: { add: jest.fn() } },
      ],
    }).compile();
    return module.get<MailerService>(MailerService);
  }

  beforeEach(() => {
    sendMail.mockClear();
    render.mockClear();
  });

  it('sends the raw html when no template is given', async () => {
    const service = await buildService();

    await service.send({ to: 'a@x.com', subject: 'Hi', html: '<b>raw</b>' });

    expect(render).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@x.com', subject: 'Hi', html: '<b>raw</b>' }),
    );
  });

  it('renders the template when one is given', async () => {
    const service = await buildService();

    await service.send({ to: 'a@x.com', subject: 'Hi', template: 'welcome', context: { n: 1 } });

    expect(render).toHaveBeenCalledWith('welcome', { n: 1, subject: 'Hi' });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ html: '<p>rendered</p>' }));
  });

  it('throws a clear error when neither template nor html is set', async () => {
    const service = await buildService();

    await expect(service.send({ to: 'a@x.com', subject: 'Hi' })).rejects.toThrow(
      'requires either "template" or "html"',
    );
    expect(sendMail).not.toHaveBeenCalled();
  });
});
