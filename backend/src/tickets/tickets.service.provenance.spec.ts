import { NotFoundException } from '@nestjs/common';
import { TicketsService } from './tickets.service';

describe('TicketsService provenance', () => {
  let ticketRepo: { findOne: jest.Mock; save: jest.Mock };
  let service: TicketsService;

  const baseTransfer = {
    fromUserId: 'u1',
    toUserId: 'u2',
    fromPublicKey: 'GA',
    toPublicKey: 'GB',
    transactionHash: 'abc',
    timestamp: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    ticketRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (v) => v),
    };
    const eventRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'e1', title: 'Gala' }),
    };
    service = new TicketsService(
      ticketRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      eventRepo as never,
      {} as never,
      {} as never,
    );
  });

  it('record_ownership_transfer appends to the existing history', async () => {
    ticketRepo.findOne.mockResolvedValue({
      id: 't1',
      transferHistory: [{ from: 'u0', to: 'u1', timestamp: 'x' }],
    });

    const ticket = await service.record_ownership_transfer('t1', baseTransfer);

    expect(ticket.transferHistory).toHaveLength(2);
    expect(ticket.transferHistory?.[1]).toMatchObject({
      from: 'u1',
      to: 'u2',
      transactionHash: 'abc',
    });
  });

  it('record_ownership_transfer starts a history when none exists', async () => {
    ticketRepo.findOne.mockResolvedValue({ id: 't1', transferHistory: null });
    const ticket = await service.record_ownership_transfer('t1', baseTransfer);
    expect(ticket.transferHistory).toHaveLength(1);
  });

  it('record_ownership_transfer throws for an unknown ticket', async () => {
    ticketRepo.findOne.mockResolvedValue(null);
    await expect(
      service.record_ownership_transfer('nope', baseTransfer),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fetch_provenance_chain returns an ordered, sequenced chain', async () => {
    ticketRepo.findOne.mockResolvedValue({
      id: 't1',
      assetCode: 'TIX1',
      ownerId: 'u3',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      transferHistory: [
        { from: 'u1', to: 'u2', timestamp: 't-a', transactionHash: 'h1' },
        { from: 'u2', to: 'u3', timestamp: 't-b' },
      ],
    });

    const chain = await service.fetch_provenance_chain('t1');

    expect(chain).toMatchObject({
      ticketId: 't1',
      assetCode: 'TIX1',
      currentOwnerId: 'u3',
      issuedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(chain.chain.map((c) => c.sequence)).toEqual([1, 2]);
    expect(chain.chain[1]).toMatchObject({
      transactionHash: null,
      fromPublicKey: null,
    });
  });

  it('render_provenance_timeline renders every transfer', async () => {
    ticketRepo.findOne.mockResolvedValue({
      id: 't1',
      assetCode: 'TIX1',
      ownerId: 'u2',
      createdAt: new Date(),
      transferHistory: [
        { from: 'u1', to: 'u2', timestamp: new Date().toISOString() },
      ],
    });
    const html = await service.render_provenance_timeline('t1');
    expect(html).toContain('Ticket Provenance - t1');
    expect(html).toContain('u1');
    expect(html).toContain('u2');
  });
});
