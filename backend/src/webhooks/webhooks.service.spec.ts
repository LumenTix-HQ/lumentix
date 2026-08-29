import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { getQueueToken } from '@nestjs/bull';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhookDeadLetter } from './entities/webhook-dead-letter.entity';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let mockQueue: { add: jest.Mock };
  let mockDeliveryRepo: { find: jest.Mock };
  let mockDeadLetterRepo: { find: jest.Mock };

  beforeEach(async () => {
    mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockDeliveryRepo = { find: jest.fn().mockResolvedValue([]) };
    mockDeadLetterRepo = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: getQueueToken('webhooks'), useValue: mockQueue },
        { provide: getRepositoryToken(WebhookDelivery), useValue: mockDeliveryRepo },
        { provide: getRepositoryToken(WebhookDeadLetter), useValue: mockDeadLetterRepo },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('queueDelivery', () => {
    it('should queue a delivery when event has webhookUrl', async () => {
      const event = { id: 'e1', webhookUrl: 'https://example.com/hook' } as any;
      const payment = {
        id: 'p1', status: 'confirmed', amount: 100, currency: 'XLM',
        transactionHash: 'tx1', updatedAt: new Date(),
      } as any;

      await service.queueDelivery(event, payment);

      expect(mockQueue.add).toHaveBeenCalledWith('send', {
        eventId: 'e1',
        paymentId: 'p1',
        payload: expect.objectContaining({
          paymentId: 'p1',
          eventId: 'e1',
          status: 'confirmed',
          amount: 100,
        }),
      });
    });

    it('should not queue when event has no webhookUrl', async () => {
      const event = { id: 'e1', webhookUrl: null } as any;
      const payment = { id: 'p1' } as any;

      await service.queueDelivery(event, payment);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('getDeliveriesForEvent', () => {
    it('should return deliveries for an event', async () => {
      const deliveries = [{ id: 'd1', eventId: 'e1' }];
      mockDeliveryRepo.find.mockResolvedValue(deliveries);

      const result = await service.getDeliveriesForEvent('e1', 'org1');

      expect(result).toEqual(deliveries);
      expect(mockDeliveryRepo.find).toHaveBeenCalledWith({
        where: { eventId: 'e1' },
        order: { sentAt: 'DESC' },
        take: 50,
      });
    });
  });
});
