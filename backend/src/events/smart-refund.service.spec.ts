import { BadRequestException } from '@nestjs/common';
import { SmartRefundService } from './smart-refund.service';

describe('SmartRefundService', () => {
  let service: SmartRefundService;
  let eventRepository: { findOne: jest.Mock };
  let escrowService: { decryptEscrowSecret: jest.Mock };
  let sorobanService: {
    cancelEventOnChain: jest.Mock;
    executeMassRefund: jest.Mock;
    verifyRefundCompletion: jest.Mock;
  };

  beforeEach(() => {
    eventRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'event-1',
        contractEventId: '23',
        escrowSecretEncrypted: 'encrypted-secret',
      }),
    };
    escrowService = {
      decryptEscrowSecret: jest.fn().mockResolvedValue('organizer-secret'),
    };
    sorobanService = {
      cancelEventOnChain: jest.fn().mockResolvedValue(undefined),
      executeMassRefund: jest.fn().mockResolvedValue(2),
      verifyRefundCompletion: jest.fn().mockResolvedValue(true),
    };
    service = new SmartRefundService(
      eventRepository as any,
      escrowService as any,
      sorobanService as any,
    );
  });

  it('uses the event contract and decrypted organizer key for cancellation and refunds', async () => {
    await service.cancelEventOnChain('event-1');
    await expect(service.executeMassRefund('event-1')).resolves.toEqual({
      eventId: 'event-1',
      refundedCount: 2,
    });

    expect(sorobanService.cancelEventOnChain).toHaveBeenCalledWith(
      'organizer-secret',
      '23',
    );
    expect(sorobanService.executeMassRefund).toHaveBeenCalledWith(
      'organizer-secret',
      '23',
    );
  });

  it('does not attempt a contract refund without on-chain configuration', async () => {
    eventRepository.findOne.mockResolvedValue({
      id: 'event-1',
      contractEventId: null,
      escrowSecretEncrypted: null,
    });

    await expect(service.executeMassRefund('event-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(sorobanService.executeMassRefund).not.toHaveBeenCalled();
  });
});
