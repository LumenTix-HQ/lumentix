import { Logger } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { AuditAction } from '../audit/entities/audit-log.entity';

/** Batch-transfer events: audit action exists and the recipient is notified through an existing queue method. */
describe('TicketsService transfer events', () => {
  let audit: { log: jest.Mock };
  let notifications: { queueTicketEmail: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let eventRepo: { findOne: jest.Mock };
  let service: TicketsService;

  beforeEach(() => {
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    notifications = { queueTicketEmail: jest.fn().mockResolvedValue(undefined) };
    userRepo = { findOne: jest.fn().mockResolvedValue({ id: 'u2', email: 'u2@example.com' }) };
    eventRepo = { findOne: jest.fn().mockResolvedValue({ id: 'e1', title: 'Gala' }) };
    service = new TicketsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      notifications as never,
      audit as never,
      {} as never,
      eventRepo as never,
      {} as never,
      userRepo as never,
    );
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('defines the TICKET_TRANSFERRED audit action', () => {
    expect(AuditAction.TICKET_TRANSFERRED).toBe('TICKET_TRANSFERRED');
  });

  it('audits each transfer and queues a notification for the recipient', async () => {
    await service.emit_batch_transfer_events('u1', [
      { ticketId: 't1', recipientUserId: 'u2', eventId: 'e1' },
    ]);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.TICKET_TRANSFERRED, resourceId: 't1' }),
    );
    expect(notifications.queueTicketEmail).toHaveBeenCalledWith({
      userId: 'u2',
      email: 'u2@example.com',
      ticketId: 't1',
      eventName: 'Gala',
    });
  });

  it('does not fail the transfer when the notification cannot be queued', async () => {
    notifications.queueTicketEmail.mockRejectedValue(new Error('queue down'));

    await expect(
      service.emit_batch_transfer_events('u1', [{ ticketId: 't1', recipientUserId: 'u2', eventId: 'e1' }]),
    ).resolves.toBeUndefined();
    expect(audit.log).toHaveBeenCalledTimes(1);
  });
});
