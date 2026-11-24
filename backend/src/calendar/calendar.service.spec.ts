import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CalendarService } from './calendar.service';
import { MailerService } from '../mailer/mailer.service';

describe('CalendarService', () => {
  let service: CalendarService;
  let mailerService: jest.Mocked<Pick<MailerService, 'send'>>;

  const baseEvent = {
    id: 'event-1',
    title: 'Launch Party',
    description: 'A great time',
    startDate: new Date('2026-01-01T18:00:00Z'),
    endDate: new Date('2026-01-01T21:00:00Z'),
    location: 'The Venue',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    mailerService = { send: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: MailerService, useValue: mailerService },
      ],
    }).compile();

    service = module.get<CalendarService>(CalendarService);
  });

  describe('generateIcalFile', () => {
    it('defaults to METHOD:PUBLISH, SEQUENCE:0, STATUS:CONFIRMED', () => {
      const ics = service.generateIcalFile({
        eventTitle: 'Test Event',
        startDate: '2026-01-01T18:00:00Z',
        endDate: '2026-01-01T21:00:00Z',
      });

      expect(ics).toContain('METHOD:PUBLISH');
      expect(ics).toContain('SEQUENCE:0');
      expect(ics).toContain('STATUS:CONFIRMED');
    });

    it('exposes the purchased-event calendar function name', () => {
      const ics = service.generate_ical_event({
        eventTitle: 'Purchased Event',
        startDate: '2026-01-01T18:00:00Z',
        endDate: '2026-01-01T21:00:00Z',
        uid: 'ticket-1@lumentix',
      });

      expect(ics).toContain('UID:ticket-1@lumentix');
    });

    it('supports a REQUEST method with a custom sequence', () => {
      const ics = service.generateIcalFile({
        eventTitle: 'Test Event',
        startDate: '2026-01-01T18:00:00Z',
        endDate: '2026-01-01T21:00:00Z',
        method: 'REQUEST',
        sequence: 3,
      });

      expect(ics).toContain('METHOD:REQUEST');
      expect(ics).toContain('SEQUENCE:3');
    });

    it('supports a CANCEL method with STATUS:CANCELLED', () => {
      const ics = service.generateIcalFile({
        eventTitle: 'Test Event',
        startDate: '2026-01-01T18:00:00Z',
        endDate: '2026-01-01T21:00:00Z',
        method: 'CANCEL',
        cancelled: true,
      });

      expect(ics).toContain('METHOD:CANCEL');
      expect(ics).toContain('STATUS:CANCELLED');
    });
  });

  describe('syncCalendarUpdate (#992)', () => {
    it('emails every attendee a REQUEST-method ICS with an .ics attachment', async () => {
      await service.syncCalendarUpdate(baseEvent, [
        { email: 'a@example.com', name: 'Ada' },
        { email: 'b@example.com' },
      ]);

      expect(mailerService.send).toHaveBeenCalledTimes(2);
      const call = mailerService.send.mock.calls[0][0];
      expect(call.to).toBe('a@example.com');
      expect(call.subject).toContain('Updated');
      expect(call.attachments?.[0].filename).toBe('event-event-1.ics');
      expect(call.attachments?.[0].content).toContain('METHOD:REQUEST');
    });

    it('supports the requested snake_case synchronization name', async () => {
      await service.sync_calendar_update(baseEvent, [{ email: 'a@example.com' }]);

      expect(mailerService.send).toHaveBeenCalledTimes(1);
    });

    it('derives SEQUENCE from the event updatedAt timestamp', async () => {
      await service.syncCalendarUpdate(baseEvent, [{ email: 'a@example.com' }]);

      const call = mailerService.send.mock.calls[0][0];
      const expectedSequence = Math.floor(baseEvent.updatedAt.getTime() / 1000);
      expect(call.attachments?.[0].content).toContain(`SEQUENCE:${expectedSequence}`);
    });

    it('does nothing when there are no attendees', async () => {
      await service.syncCalendarUpdate(baseEvent, []);
      expect(mailerService.send).not.toHaveBeenCalled();
    });

    it('does not throw when a single attendee send fails — others still get emailed', async () => {
      mailerService.send
        .mockRejectedValueOnce(new Error('smtp down'))
        .mockResolvedValueOnce(undefined);

      await expect(
        service.syncCalendarUpdate(baseEvent, [
          { email: 'fails@example.com' },
          { email: 'succeeds@example.com' },
        ]),
      ).resolves.toBeUndefined();

      expect(mailerService.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('removeCancelledEvent (#992)', () => {
    it('emails every attendee a CANCEL-method ICS', async () => {
      await service.removeCancelledEvent(baseEvent, [{ email: 'a@example.com' }]);

      expect(mailerService.send).toHaveBeenCalledTimes(1);
      const call = mailerService.send.mock.calls[0][0];
      expect(call.subject).toContain('Cancelled');
      expect(call.attachments?.[0].content).toContain('METHOD:CANCEL');
      expect(call.attachments?.[0].content).toContain('STATUS:CANCELLED');
    });

    it('supports the requested snake_case cancellation name', async () => {
      await service.remove_cancelled_event(baseEvent, [{ email: 'a@example.com' }]);

      expect(mailerService.send).toHaveBeenCalledTimes(1);
    });

    it('does nothing when there are no attendees', async () => {
      await service.removeCancelledEvent(baseEvent, []);
      expect(mailerService.send).not.toHaveBeenCalled();
    });
  });
});
