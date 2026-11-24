jest.mock('../payments/payments.service', () => ({
  PaymentsService: class {},
}));
import { TicketsService } from './tickets.service';

// Isolate check-in from unrelated payment and notification dependencies.
describe('Kiosk check-in', () => {
  const ticket = {
    id: 'ticket',
    eventId: 'event',
    ownerId: 'attendee',
    status: 'valid',
  };
  let service: TicketsService;
  let repo: { findOne: jest.Mock; update: jest.Mock };
  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue({ ...ticket }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    service = Object.assign(
      Object.create(TicketsService.prototype) as TicketsService,
      {
        ticketRepo: repo,
        eventRepo: {
          findOne: jest.fn().mockResolvedValue({ organizerId: 'organizer' }),
        },
        userRepo: {
          findOne: jest.fn().mockResolvedValue({
            displayName: 'Ada',
            email: 'ada@example.com',
            logoUrl: 'https://example.com/photo.png',
          }),
        },
        ticketSigningService: { verify: jest.fn().mockReturnValue(true) },
        auditService: { log: jest.fn().mockResolvedValue(undefined) },
      },
    );
  });
  const qr = JSON.stringify({ ticketId: 'ticket', signature: 'signature' });
  const actor = { id: 'organizer', role: 'organizer' };
  it('checks in atomically and returns the stored profile photo', async () => {
    const result = await service.verifyQrCheckIn(qr, actor, 'event');
    expect(result.attendeePhotoUrl).toBe('https://example.com/photo.png');
    expect(repo.update).toHaveBeenCalledWith(
      { id: 'ticket', ownerId: 'attendee', status: 'valid' },
      { status: 'used' },
    );
  });
  it('rejects wrong-event scans before consuming the ticket', async () => {
    await expect(service.verifyQrCheckIn(qr, actor, 'other')).rejects.toThrow(
      'different event',
    );
    expect(repo.update).not.toHaveBeenCalled();
  });
  it('rejects organizers of other events', async () => {
    await expect(
      service.verifyQrCheckIn(
        qr,
        { id: 'stranger', role: 'organizer' },
        'event',
      ),
    ).rejects.toThrow('cannot check in');
    expect(repo.update).not.toHaveBeenCalled();
  });
  it('rejects a concurrent duplicate scan', async () => {
    repo.update.mockResolvedValue({ affected: 0 });
    await expect(service.verifyQrCheckIn(qr, actor, 'event')).rejects.toThrow(
      'already been checked in',
    );
  });
  it('rejects null QR payloads as bad input', async () => {
    await expect(
      service.verifyQrCheckIn('null', actor, 'event'),
    ).rejects.toThrow('QR code missing');
  });
});
