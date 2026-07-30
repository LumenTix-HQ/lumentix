import { ConflictException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentStatus } from './entities/payment.entity';

describe('PaymentsService — #824 transaction hash replay prevention', () => {
  let service: PaymentsService;
  let paymentsRepo: any;
  let stellarService: any;
  let auditService: any;
  let eventsService: any;
  let webhooksService: any;
  let notificationService: any;

  beforeEach(() => {
    paymentsRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
    stellarService = {
      getTransaction: jest.fn(),
      extractAndValidateMemo: jest.fn(),
    };
    auditService = { log: jest.fn() };
    eventsService = { getEventById: jest.fn() };
    webhooksService = { queueDelivery: jest.fn() };
    notificationService = {};

    service = new PaymentsService(
      paymentsRepo,
      {} as any,
      {} as any,
      eventsService,
      {} as any,
      stellarService,
      auditService,
      {} as any,
      {} as any,
      notificationService,
      webhooksService,
    );
  });

  it('rejects a payment confirm if transactionHash already exists on another payment', async () => {
    paymentsRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'existing-payment',
        transactionHash: 'abc123',
        status: PaymentStatus.CONFIRMED,
      });

    await expect(
      service.confirmPayment({ transactionHash: 'abc123' } as any, 'user-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('allows confirm when transactionHash is unique', async () => {
    paymentsRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'pay-1',
        status: PaymentStatus.PENDING,
        userId: 'user-1',
        amount: 10,
        currency: 'XLM',
        eventId: 'ev-1',
        isSeasonPass: false,
        expiresAt: new Date(Date.now() + 3600000),
      });
    stellarService.getTransaction.mockResolvedValue({
      memo: 'pay-1',
      fee_successful: true,
    });
    stellarService.extractAndValidateMemo.mockReturnValue('pay-1');
    eventsService.getEventById.mockResolvedValue({ escrowPublicKey: 'ESCROW' });

    paymentsRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'pay-1',
        status: PaymentStatus.PENDING,
        userId: 'user-1',
        amount: 10,
        currency: 'XLM',
        eventId: 'ev-1',
        isSeasonPass: false,
        expiresAt: new Date(Date.now() + 3600000),
      });

    const result = await service.confirmPayment(
      { transactionHash: 'unique-hash' } as any,
      'user-1',
    );
    expect(result).toBeDefined();
  });
});
