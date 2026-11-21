import { CancelEventProcessor } from './cancel-event.processor';

describe('CancelEventProcessor on-chain refunds', () => {
  const eventId = 'event-1';
  let processor: CancelEventProcessor;
  let smartRefundService: {
    cancelEventOnChain: jest.Mock;
    executeMassRefund: jest.Mock;
    verifyRefundCompletion: jest.Mock;
  };
  let eventsRepository: { findOne: jest.Mock; update: jest.Mock };

  beforeEach(() => {
    smartRefundService = {
      cancelEventOnChain: jest.fn().mockResolvedValue(undefined),
      executeMassRefund: jest
        .fn()
        .mockResolvedValue({ eventId, refundedCount: 3 }),
      verifyRefundCompletion: jest
        .fn()
        .mockResolvedValue({ eventId, complete: true }),
    };
    eventsRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: eventId,
        contractEventId: '23',
        escrowSecretEncrypted: 'encrypted-secret',
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    processor = new CancelEventProcessor(
      { refundAllForEvent: jest.fn().mockResolvedValue([]) } as any,
      smartRefundService as any,
      { log: jest.fn().mockResolvedValue(undefined) } as any,
      eventsRepository as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { remove_cancelled_event: jest.fn().mockResolvedValue(undefined) } as any,
    );
  });

  it('cancels, refunds, and verifies the contract event automatically', async () => {
    await processor.handleCancelEvent({ data: { eventId } } as any);

    expect(smartRefundService.cancelEventOnChain).toHaveBeenCalledWith(eventId);
    expect(smartRefundService.executeMassRefund).toHaveBeenCalledWith(eventId);
    expect(smartRefundService.verifyRefundCompletion).toHaveBeenCalledWith(
      eventId,
    );
    expect(eventsRepository.update).toHaveBeenCalledWith(
      eventId,
      expect.objectContaining({ onChainRefundVerifiedAt: expect.any(Date) }),
    );
  });

  it('fails the job when contract refunds are not verified so Bull can retry', async () => {
    smartRefundService.verifyRefundCompletion.mockResolvedValue({
      eventId,
      complete: false,
    });

    await expect(
      processor.handleCancelEvent({ data: { eventId } } as any),
    ).rejects.toThrow('are not complete');
    expect(eventsRepository.update).not.toHaveBeenCalled();
  });

  it('keeps classic-Stellar-only events out of the smart-contract refund path', async () => {
    eventsRepository.findOne.mockResolvedValue({
      id: eventId,
      contractEventId: null,
      escrowSecretEncrypted: 'encrypted-classic-escrow-key',
    });

    await processor.handleCancelEvent({ data: { eventId } } as any);

    expect(smartRefundService.cancelEventOnChain).not.toHaveBeenCalled();
  });
});
