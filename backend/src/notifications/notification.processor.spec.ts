import { Job, Queue } from 'bull';
import { NotificationProcessor } from './notification.processor';
import { MailerService } from '../mailer/mailer.service';
import { UsersService } from '../users/users.service';
import { CalendarService } from '../calendar/calendar.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationChannel } from './dto/save-notification-preferences.dto';

const job = (name: string, data: Record<string, unknown>) =>
  ({ id: 'job-1', name, data }) as unknown as Job;

describe('NotificationProcessor — MailerService.send options', () => {
  let send: jest.Mock;
  let findById: jest.Mock;
  let processor: NotificationProcessor;

  beforeEach(() => {
    send = jest.fn().mockResolvedValue(undefined);
    findById = jest.fn().mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    processor = new NotificationProcessor(
      { send } as unknown as MailerService,
      { findById } as unknown as UsersService,
      {} as CalendarService,
      {
        resolveRoute: jest.fn().mockReturnValue({ channels: ['email'], delayMs: 0 }),
      } as unknown as NotificationPreferencesService,
      { add: jest.fn() } as unknown as Queue,
    );
  });

  it('sendTicketEmail passes the ticket-ready template and context', async () => {
    await processor.handleTicketEmail(
      job('sendTicketEmail', { email: 'a@x.com', ticketId: 't1', eventName: 'Gala', pdfUrl: 'u' }),
    );

    expect(send).toHaveBeenCalledWith({
      to: 'a@x.com',
      subject: 'Your ticket for Gala',
      template: 'ticket-ready',
      context: expect.objectContaining({ ticketId: 't1', eventTitle: 'Gala', qrCodeUrl: 'u' }),
    });
  });

  it('sendTicketSoldEmail passes html', async () => {
    await processor.handleTicketSoldEmail(
      job('sendTicketSoldEmail', { email: 'a@x.com', ticketId: 't1', amount: 5, currency: 'XLM' }),
    );

    expect(send).toHaveBeenCalledWith({
      to: 'a@x.com',
      subject: 'Your ticket has been sold',
      html: expect.stringContaining('5 XLM'),
    });
  });

  it('sendRefundEmail passes the refund-issued template', async () => {
    await processor.handleRefundEmail(
      job('sendRefundEmail', { email: 'a@x.com', amount: 7, refundId: 'r1', currency: 'XLM' }),
    );

    expect(send).toHaveBeenCalledWith({
      to: 'a@x.com',
      subject: 'Your refund has been processed',
      template: 'refund-issued',
      context: expect.objectContaining({ amount: 7, refundId: 'r1', currency: 'XLM' }),
    });
  });

  it('sendSponsorEmail passes html', async () => {
    await processor.handleSponsorEmail(
      job('sendSponsorEmail', { email: 'a@x.com', sponsorName: 'Acme' }),
    );

    expect(send).toHaveBeenCalledWith({
      to: 'a@x.com',
      subject: 'Sponsorship confirmed',
      html: expect.stringContaining('Acme'),
    });
  });

  it('sendSponsorConfirmedEmail passes html to the provided address', async () => {
    await processor.handleSponsorConfirmedEmail(
      job('sendSponsorConfirmedEmail', {
        email: 'a@x.com',
        sponsorName: 'Acme',
        eventTitle: 'Gala',
        amount: 10,
        currency: 'XLM',
        transactionHash: 'abc',
      }),
    );

    expect(send).toHaveBeenCalledWith({
      to: 'a@x.com',
      subject: 'Sponsorship Confirmed: Gala',
      html: expect.stringContaining('abc'),
    });
  });

  it('sendPaymentFailedEmail passes html', async () => {
    await processor.handlePaymentFailedEmail(
      job('sendPaymentFailedEmail', {
        email: 'a@x.com',
        eventTitle: 'Gala',
        amount: 10,
        currency: 'XLM',
        reason: 'timeout',
      }),
    );

    expect(send).toHaveBeenCalledWith({
      to: 'a@x.com',
      subject: 'Payment Failed: Gala',
      html: expect.stringContaining('timeout'),
    });
  });

  it('sendEventCancelledEmail passes the event-cancelled template', async () => {
    await processor.handleEventCancelledEmail(
      job('sendEventCancelledEmail', { userId: 'user-1', eventTitle: 'Gala' }),
    );

    expect(send).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Event Cancelled: Gala',
      template: 'event-cancelled',
      context: expect.objectContaining({ eventTitle: 'Gala', refundEligible: true }),
    });
  });

  it('sendEventPublishedEmail passes html to the organizer', async () => {
    await processor.handleEventPublishedEmail(
      job('sendEventPublishedEmail', { organizerId: 'user-1', eventTitle: 'Gala' }),
    );

    expect(send).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Your Event is Live: Gala',
      html: expect.stringContaining('Gala'),
    });
  });

  it('sendEventCompletedEmail passes html to the organizer', async () => {
    await processor.handleEventCompletedEmail(
      job('sendEventCompletedEmail', { organizerId: 'user-1', eventTitle: 'Gala' }),
    );

    expect(send).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Event Completed: Gala',
      html: expect.stringContaining('Gala'),
    });
  });

  it('sendTierChangeEmail passes html with the new tier', async () => {
    await processor.handleTierChangeEmail(
      job('sendTierChangeEmail', { userId: 'user-1', previousTier: 'Bronze', newTier: 'Silver' }),
    );

    expect(send).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: "You've reached Silver tier!",
      html: expect.stringContaining('Silver'),
    });
  });
});

describe('NotificationProcessor — preference routing', () => {
  let send: jest.Mock;
  let add: jest.Mock;
  let findById: jest.Mock;
  let processor: NotificationProcessor;
  let preferences: NotificationPreferencesService;

  const ticketJob = () =>
    ({
      id: 'job-1',
      name: 'sendTicketEmail',
      data: { userId: 'user-1', email: 'a@x.com', ticketId: 't1', eventName: 'Gala' },
      opts: { attempts: 3, jobId: 'job-1' },
    }) as unknown as Job;

  beforeEach(() => {
    send = jest.fn().mockResolvedValue(undefined);
    add = jest.fn().mockResolvedValue(undefined);
    findById = jest.fn();
    preferences = new NotificationPreferencesService({} as any);
    processor = new NotificationProcessor(
      { send } as unknown as MailerService,
      { findById } as unknown as UsersService,
      {} as CalendarService,
      preferences,
      { add } as unknown as Queue,
    );
  });

  it('skips the email when the user disabled email for the category', async () => {
    findById.mockResolvedValue({
      id: 'user-1',
      channelNotificationPreferences: { email: { paymentConfirmations: false } },
      quietHours: { enabled: false, start: '22:00', end: '08:00', timezone: 'UTC' },
    });

    await processor.handleTicketEmail(ticketJob());

    expect(send).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('sends when email is enabled for the category even if another channel is off', async () => {
    findById.mockResolvedValue({
      id: 'user-1',
      channelNotificationPreferences: { push: { paymentConfirmations: false } },
      quietHours: { enabled: false, start: '22:00', end: '08:00', timezone: 'UTC' },
    });

    await processor.handleTicketEmail(ticketJob());

    expect(send).toHaveBeenCalled();
  });

  it('defers the job until quiet hours end instead of dropping it', async () => {
    jest.spyOn(preferences, 'resolveRoute').mockReturnValue({
      channels: [NotificationChannel.EMAIL],
      delayMs: 60_000,
    });
    findById.mockResolvedValue({ id: 'user-1' });

    await processor.handleTicketEmail(ticketJob());

    expect(send).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(
      'sendTicketEmail',
      expect.objectContaining({ ticketId: 't1' }),
      expect.objectContaining({ delay: 60_000, attempts: 3, jobId: undefined }),
    );
  });

  it('applies organizer preferences to organizer lifecycle emails', async () => {
    findById.mockResolvedValue({
      id: 'org-1',
      email: 'org@x.com',
      channelNotificationPreferences: { email: { scheduleChanges: false } },
    });

    await processor.handleEventPublishedEmail(
      job('sendEventPublishedEmail', { organizerId: 'org-1', eventTitle: 'Gala' }),
    );

    expect(send).not.toHaveBeenCalled();
  });
});
