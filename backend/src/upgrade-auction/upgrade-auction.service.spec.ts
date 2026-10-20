import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UpgradeAuctionService } from './upgrade-auction.service';
import { UpgradeAuction } from './entities/upgrade-auction.entity';
import { UpgradeBid } from './entities/upgrade-bid.entity';
import { EventsService } from '../events/events.service';
import { TicketsService } from '../tickets/tickets.service';

/**
 * Simulates the serialization a `pessimistic_write` lock on the auction row
 * would give two concurrent transactions: whichever call reaches
 * `dataSource.transaction()` first runs to completion before the next one's
 * callback starts. This is what actually prevents the race described in
 * #1135 — two bids reading the same "highest bid" before either write lands.
 */
function makeSerializingDataSource(em: unknown) {
  let queue: Promise<unknown> = Promise.resolve();
  const transaction = jest.fn((cb: (em: unknown) => Promise<unknown>) => {
    const run = queue.then(() => cb(em));
    queue = run.catch(() => undefined);
    return run;
  });
  return { transaction } as unknown as jest.Mocked<Pick<DataSource, 'transaction'>>;
}

function makeAuctionEntityManager(auction: {
  id: string;
  status: string;
  startingPrice: number;
  minIncrement: number;
  slotsAvailable: number;
}) {
  const bids: Array<{ auctionId: string; ticketId: string; bidderId: string; amount: number; status: string; placedAt: Date }> = [];

  const em = {
    findOne: jest.fn(async (entity: unknown, opts: any) => {
      if (entity === UpgradeAuction) return { ...auction };
      if (entity === UpgradeBid) {
        const active = bids
          .filter((b) => b.auctionId === opts.where.auctionId && b.status === 'active')
          .sort((a, b) => b.amount - a.amount);
        return active[0] ?? null;
      }
      return null;
    }),
    find: jest.fn(async (entity: unknown, opts: any) => {
      if (entity === UpgradeBid) {
        return bids
          .filter((b) => b.auctionId === opts.where.auctionId && b.status === opts.where.status)
          .sort((a, b) => b.amount - a.amount);
      }
      return [];
    }),
    update: jest.fn(async (entity: unknown, criteria: any, partial: any) => {
      bids
        .filter(
          (b) =>
            b.auctionId === criteria.auctionId &&
            b.ticketId === criteria.ticketId &&
            b.status === criteria.status,
        )
        .forEach((b) => Object.assign(b, partial));
    }),
    create: jest.fn((_entity: unknown, data: any) => ({ ...data, placedAt: new Date() })),
    save: jest.fn(async (entityOrArray: any) => {
      const arr = Array.isArray(entityOrArray) ? entityOrArray : [entityOrArray];
      for (const item of arr) {
        if (item.id === auction.id) {
          Object.assign(auction, item);
        } else if (!bids.includes(item)) {
          bids.push(item);
        }
      }
      return entityOrArray;
    }),
  };

  return { em, bids, auction };
}

describe('UpgradeAuctionService.placeUpgradeBid', () => {
  async function buildService(auction: {
    id: string;
    status: string;
    startingPrice: number;
    minIncrement: number;
    slotsAvailable: number;
  }) {
    const { em, bids } = makeAuctionEntityManager(auction);
    const dataSource = makeSerializingDataSource(em);

    const auctionRepository = { findOne: jest.fn(async () => ({ ...auction, opensAt: null, closesAt: new Date(Date.now() + 60_000) })) };
    const bidRepository = {};
    const ticketsService: jest.Mocked<Pick<TicketsService, 'getTicketById'>> = {
      getTicketById: jest.fn(),
    };
    const eventsService: jest.Mocked<Pick<EventsService, 'getEventById'>> = {
      getEventById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpgradeAuctionService,
        { provide: getRepositoryToken(UpgradeAuction), useValue: auctionRepository },
        { provide: getRepositoryToken(UpgradeBid), useValue: bidRepository },
        { provide: EventsService, useValue: eventsService },
        { provide: TicketsService, useValue: ticketsService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    return {
      service: module.get<UpgradeAuctionService>(UpgradeAuctionService),
      ticketsService,
      bids,
    };
  }

  const AUCTION = { id: 'auction-1', status: 'open', startingPrice: 100, minIncrement: 5, slotsAvailable: 1 };

  it('accepts a single valid bid at or above the starting price', async () => {
    const { service, ticketsService } = await buildService(AUCTION);
    ticketsService.getTicketById.mockResolvedValue({ id: 't1', ownerId: 'bidder-1', eventId: 'event-1' } as any);

    const bid = await service.placeUpgradeBid('auction-1', { ticketId: 't1', amount: 101 } as any, 'bidder-1');

    expect(bid.status).toBe('active');
    expect(bid.amount).toBe(101);
  });

  it('rejects a bid below the current minimum required amount', async () => {
    const { service, ticketsService, bids } = await buildService(AUCTION);
    ticketsService.getTicketById.mockResolvedValue({ id: 't1', ownerId: 'bidder-1', eventId: 'event-1' } as any);
    bids.push({
      auctionId: 'auction-1',
      ticketId: 't0',
      bidderId: 'bidder-0',
      amount: 150,
      status: 'active',
      placedAt: new Date(),
    });

    await expect(
      service.placeUpgradeBid('auction-1', { ticketId: 't1', amount: 152 } as any, 'bidder-1'),
    ).rejects.toThrow(BadRequestException);
  });

  // Regression test for #1135: two near-simultaneous bids that both clear
  // the *stale* minRequired must not both succeed — the second must be
  // re-checked against the first bid's amount, not the value read before
  // either write landed.
  it('does not let two concurrent bids both bypass the minimum increment', async () => {
    const { service, ticketsService, bids } = await buildService(AUCTION);
    ticketsService.getTicketById.mockImplementation(async (id: string) =>
      ({ id, ownerId: id === 't1' ? 'bidder-1' : 'bidder-2', eventId: 'event-1' } as any),
    );

    // Both amounts individually clear the starting price (100) that a
    // stale/unlocked read would see, but bid B (102) does not clear
    // bid A's amount (101) + minIncrement (5) = 106 once A has landed.
    const results = await Promise.allSettled([
      service.placeUpgradeBid('auction-1', { ticketId: 't1', amount: 101 } as any, 'bidder-1'),
      service.placeUpgradeBid('auction-1', { ticketId: 't2', amount: 102 } as any, 'bidder-2'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BadRequestException);

    const activeBids = bids.filter((b) => b.status === 'active');
    expect(activeBids).toHaveLength(1);
    expect(activeBids[0].amount).toBe(101);
  });
});
