import { PaymentsService } from './payments.service';
import { EventStatus } from '../events/entities/event.entity';

/**
 * createPaymentIntent: series discount + carbon offset, and path payment selection.
 * The service is constructed directly with stubs for exactly the collaborators this path uses.
 */
describe('PaymentsService.createPaymentIntent', () => {
  let paymentsRepository: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let userRepository: { findOne: jest.Mock };
  let eventSeriesRepository: { findOne: jest.Mock };
  let eventRepository: { find: jest.Mock };
  let ticketRepository: { count: jest.Mock };
  let eventsService: { getEventById: jest.Mock };
  let stellarService: { findPaymentPath: jest.Mock };
  let service: PaymentsService;

  const baseEvent = {
    id: 'event-1',
    status: EventStatus.PUBLISHED,
    ticketPrice: 100,
    currency: 'XLM',
    escrowPublicKey: 'GESCROW',
    maxAttendees: null,
    seriesId: null as string | null,
  };

  beforeEach(() => {
    paymentsRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'pay-1', expiresAt: new Date(), ...value })),
    };
    userRepository = { findOne: jest.fn().mockResolvedValue({ stellarPublicKey: 'GUSER' }) };
    eventSeriesRepository = { findOne: jest.fn() };
    eventRepository = { find: jest.fn().mockResolvedValue([{ id: 'event-1' }, { id: 'event-2' }]) };
    ticketRepository = { count: jest.fn().mockResolvedValue(0) };
    eventsService = { getEventById: jest.fn().mockResolvedValue({ ...baseEvent }) };
    stellarService = { findPaymentPath: jest.fn() };

    service = new PaymentsService(
      paymentsRepository as never,
      userRepository as never,
      eventSeriesRepository as never,
      eventRepository as never,
      ticketRepository as never,
      eventsService as never,
      stellarService as never,
      { log: jest.fn() } as never,
      {} as never,
      { findActiveCodes: jest.fn().mockResolvedValue(['XLM', 'USDC']) } as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service, 'calculate_travel_offset').mockResolvedValue(2.5);
  });

  it('adds the carbon offset on top of the series-discounted price', async () => {
    eventsService.getEventById.mockResolvedValue({ ...baseEvent, seriesId: 'series-1' });
    eventSeriesRepository.findOne.mockResolvedValue({ id: 'series-1', discountPercentage: 10 });
    ticketRepository.count.mockResolvedValue(1);

    const result = await service.createPaymentIntent('event-1', 'user-1', undefined, false, undefined, true);

    expect(paymentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 92.5, carbonOffsetAmount: 2.5 }),
    );
    expect(result.amount).toBe(92.5);
  });

  it('applies the series discount without an offset when not requested', async () => {
    eventsService.getEventById.mockResolvedValue({ ...baseEvent, seriesId: 'series-1' });
    eventSeriesRepository.findOne.mockResolvedValue({ id: 'series-1', discountPercentage: 10 });
    ticketRepository.count.mockResolvedValue(1);

    await service.createPaymentIntent('event-1', 'user-1');

    expect(paymentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 90, carbonOffsetAmount: 0 }),
    );
    expect(service.calculate_travel_offset).not.toHaveBeenCalled();
  });

  it('adds the offset to the full price when there is no series discount', async () => {
    await service.createPaymentIntent('event-1', 'user-1', undefined, false, undefined, true);

    expect(paymentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 102.5, carbonOffsetAmount: 2.5 }),
    );
  });

  it('selects the path with the lowest source amount', async () => {
    stellarService.findPaymentPath.mockResolvedValue([
      { source_amount: '120.0', path: [{ asset_type: 'native' }] },
      { source_amount: '95.5', path: [{ asset_type: 'credit_alphanum4', asset_code: 'EURC' }] },
      { source_amount: '101.0', path: [] },
    ]);

    const result = await service.createPaymentIntent('event-1', 'user-1', 'USDC', true, 'XLM');

    expect(result.pathPayment).toEqual({
      sendAsset: 'XLM',
      sendAmount: '95.5',
      path: ['EURC'],
    });
  });

  it('omits pathPayment when no path is returned', async () => {
    stellarService.findPaymentPath.mockResolvedValue([]);

    const result = await service.createPaymentIntent('event-1', 'user-1', 'USDC', true, 'XLM');

    expect(result.pathPayment).toBeUndefined();
  });
});
