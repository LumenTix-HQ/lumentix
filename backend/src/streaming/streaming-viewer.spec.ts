import { ConfigService } from '@nestjs/config';
import { FindManyOptions, Repository } from 'typeorm';
import { StreamingService } from './streaming.service';
import { StreamingConfig } from './entities/streaming-config.entity';
import { Event } from '../events/entities/event.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';

describe('Viewer streaming access', () => {
  const configs = { findOne: jest.fn() };
  const events = { findOne: jest.fn() };
  const tickets = {
    exists: jest.fn<Promise<boolean>, [FindManyOptions<TicketEntity>]>(),
  };
  let service: StreamingService;
  beforeEach(() => {
    events.findOne.mockResolvedValue({ organizerId: 'organizer' });
    configs.findOne.mockResolvedValue({
      eventId: 'event',
      streamUrl: 'https://stream.example/master.m3u8',
      adaptiveBitrate: true,
    });
    tickets.exists.mockReset().mockResolvedValue(true);
    service = new StreamingService(
      configs as unknown as Repository<StreamingConfig>,
      events as unknown as Repository<Event>,
      new ConfigService(),
      tickets as unknown as Repository<TicketEntity>,
    );
  });
  it('returns playback for ticket holders', async () => {
    expect(
      (await service.viewerPlayback('event', 'viewer')).playbackUrl,
    ).toContain('master.m3u8');
    expect(tickets.exists.mock.calls[0][0]).toMatchObject({
      where: { ownerId: 'viewer', eventId: 'event' },
    });
  });
  it('denies access without an eligible ticket', async () => {
    tickets.exists.mockResolvedValue(false);
    await expect(service.viewerPlayback('event', 'viewer')).rejects.toThrow(
      'ticket is required',
    );
  });
  it('allows the organizer to preview', async () => {
    await service.viewerPlayback('event', 'organizer');
    expect(tickets.exists).not.toHaveBeenCalled();
  });
  it('reports unavailable streams and rejects unauthorized telemetry', async () => {
    configs.findOne.mockResolvedValue(null);
    await expect(service.viewerPlayback('event', 'organizer')).rejects.toThrow(
      'not available',
    );
    tickets.exists.mockResolvedValue(false);
    await expect(
      service.report_buffering_event('event', 'viewer', 1000, 2500),
    ).rejects.toThrow('ticket is required');
  });
});
