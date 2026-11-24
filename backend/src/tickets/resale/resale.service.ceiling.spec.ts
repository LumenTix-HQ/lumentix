import { BadRequestException } from '@nestjs/common';
import { ResaleService } from './resale.service';

/**
 * Per-event resale price ceilings: listing, purchase, verification and enforcement must all
 * use the same persisted cap.
 */
describe('ResaleService price ceilings', () => {
  let ticketRepo: { findOne: jest.Mock; save: jest.Mock };
  let eventRepo: { findOne: jest.Mock };
  let ceilingRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let service: ResaleService;

  const event = { id: 'event-1', ticketPrice: 100, currency: 'XLM', organizerId: 'org-1' };
  const ticket = {
    id: 'ticket-1',
    eventId: 'event-1',
    ownerId: 'owner-1',
    status: 'valid',
    isListed: false,
  };

  beforeEach(() => {
    ticketRepo = { findOne: jest.fn().mockResolvedValue({ ...ticket }), save: jest.fn(async (t) => t) };
    eventRepo = { findOne: jest.fn().mockResolvedValue(event) };
    ceilingRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (c) => c),
      create: jest.fn((c) => c),
    };
    service = new ResaleService(
      ticketRepo as never,
      eventRepo as never,
      {} as never,
      {} as never,
      ceilingRepo as never,
      {} as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
      { store: { keys: jest.fn().mockResolvedValue([]) }, del: jest.fn() } as never,
    );
    jest.spyOn(service as never, 'invalidateMarketplaceCache').mockResolvedValue(undefined as never);
  });

  it('allows a listing up to the default 150% when no ceiling is configured', async () => {
    const result = await service.listTicketForResale('ticket-1', 'owner-1', {
      price: 140,
      currency: 'XLM',
    } as never);

    expect(result.maxAllowedPrice).toBe(150);
    expect(result.isListed).toBe(true);
  });

  it('rejects a listing above a stricter custom ceiling that is still below the default cap', async () => {
    ceilingRepo.findOne.mockResolvedValue({
      eventId: 'event-1',
      ceilingMultiplierBps: 11000,
      absoluteCeiling: 0,
    });

    await expect(
      service.listTicketForResale('ticket-1', 'owner-1', { price: 140, currency: 'XLM' } as never),
    ).rejects.toThrow(BadRequestException);
    expect(ticketRepo.save).not.toHaveBeenCalled();
  });

  it('allows a listing at or below the custom ceiling', async () => {
    ceilingRepo.findOne.mockResolvedValue({
      eventId: 'event-1',
      ceilingMultiplierBps: 11000,
      absoluteCeiling: 0,
    });

    const result = await service.listTicketForResale('ticket-1', 'owner-1', {
      price: 110,
      currency: 'XLM',
    } as never);

    expect(result.maxAllowedPrice).toBeCloseTo(110);
  });

  it('applies the absolute ceiling when it is lower than the multiplier cap', async () => {
    ceilingRepo.findOne.mockResolvedValue({
      eventId: 'event-1',
      ceilingMultiplierBps: 20000,
      absoluteCeiling: 120,
    });

    const check = await service.verifyResalePrice({ eventId: 'event-1', proposedPrice: 130 } as never);

    expect(check.compliant).toBe(false);
    expect(check.maxAllowedPrice).toBe(120);
  });

  it('buyResaleTicket refuses a stale listing above the custom ceiling', async () => {
    ceilingRepo.findOne.mockResolvedValue({
      eventId: 'event-1',
      ceilingMultiplierBps: 11000,
      absoluteCeiling: 0,
    });
    ticketRepo.findOne.mockResolvedValue({
      ...ticket,
      isListed: true,
      listingPrice: 140,
      listingCurrency: 'XLM',
    });

    await expect(
      service.buyResaleTicket('ticket-1', 'buyer-1', { transactionHash: 'tx' } as never),
    ).rejects.toThrow('exceeds the maximum allowed resale price');
  });

  it('persists a ceiling set by the organizer', async () => {
    await service.setPriceCeiling('org-1', {
      eventId: 'event-1',
      ceilingMultiplierBps: 12000,
      absoluteCeiling: 0,
    } as never);

    expect(ceilingRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'event-1', ceilingMultiplierBps: 12000 }),
    );
  });
});
