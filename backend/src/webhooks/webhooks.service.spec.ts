import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { getQueueToken } from '@nestjs/bull';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhookDeadLetter } from './entities/webhook-dead-letter.entity';
import { Event } from '../events/entities/event.entity';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let mockQueue: { add: jest.Mock };
  let mockDeliveryRepo: { find: jest.Mock };
  let mockDeadLetterRepo: { find: jest.Mock; findOne: jest.Mock; delete: jest.Mock };
  let mockEventRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockDeliveryRepo = { find: jest.fn().mockResolvedValue([]) };
    mockDeadLetterRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    mockEventRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'e1', organizerId: 'org1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: getQueueToken('webhooks'), useValue: mockQueue },
        { provide: getRepositoryToken(WebhookDelivery), useValue: mockDeliveryRepo },
        { provide: getRepositoryToken(WebhookDeadLetter), useValue: mockDeadLetterRepo },
        { provide: getRepositoryToken(Event), useValue: mockEventRepo },
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

  describe('getDeadLettersForEvent', () => {
    it('should return dead letters for an event', async () => {
      const deadLetters = [{ id: 'dl1', eventId: 'e1' }];
      mockDeadLetterRepo.find.mockResolvedValue(deadLetters);

      const result = await service.getDeadLettersForEvent('e1', 'org1');

      expect(result).toEqual(deadLetters);
      expect(mockDeadLetterRepo.find).toHaveBeenCalledWith({
        where: { eventId: 'e1' },
        order: { createdAt: 'DESC' },
        take: 50,
      });
    });
  });

  describe('organizer authorization', () => {
    it('rejects callers who do not organize the event', async () => {
      await expect(service.getDeliveriesForEvent('e1', 'someone-else')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.getDeadLettersForEvent('e1', 'someone-else')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockDeliveryRepo.find).not.toHaveBeenCalled();
      expect(mockDeadLetterRepo.find).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown event', async () => {
      mockEventRepo.findOne.mockResolvedValue(null);
      await expect(service.getDeliveriesForEvent('missing', 'org1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('replayDeadLetter', () => {
    const deadLetter = {
      id: 'dl1',
      eventId: 'e1',
      paymentId: 'p1',
      payload: { paymentId: 'p1' },
    };

    it('re-queues the payload as a fresh first attempt and removes the dead letter', async () => {
      mockDeadLetterRepo.findOne.mockResolvedValue(deadLetter);

      await expect(service.replayDeadLetter('e1', 'dl1', 'org1')).resolves.toEqual({
        queued: true,
      });

      expect(mockQueue.add).toHaveBeenCalledWith('send', {
        eventId: 'e1',
        paymentId: 'p1',
        payload: { paymentId: 'p1' },
      });
      expect(mockDeadLetterRepo.delete).toHaveBeenCalledWith({ id: 'dl1' });
    });

    it('only replays dead letters belonging to the given event', async () => {
      mockDeadLetterRepo.findOne.mockResolvedValue(null);

      await expect(service.replayDeadLetter('e1', 'dl-other', 'org1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockDeadLetterRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'dl-other', eventId: 'e1' },
      });
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('rejects non-organizers', async () => {
      await expect(service.replayDeadLetter('e1', 'dl1', 'someone-else')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});
