/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { FindOptionsWhere, Repository } from 'typeorm';
import { EventsService } from './events.service';
import { Event, EventStatus } from './entities/event.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { EventStateService } from './state/event-state.service';
import { User } from '../users/entities/user.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { NotificationService } from '../notifications/notification.service';
import { EscrowService } from '../payments/services/escrow.service';

const mockEvent: Event = {
  id: 'uuid-1',
  title: 'Test Event',
  description: 'A test event',
  location: 'Lagos',
  startDate: new Date('2025-06-01'),
  endDate: new Date('2025-06-02'),
  ticketPrice: 10,
  currency: 'USD',
  organizerId: 'organizer-1',
  status: EventStatus.DRAFT,
  maxAttendees: 100,
  escrowPublicKey: null,
  escrowSecretEncrypted: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  remove: jest.fn(),
};

describe('EventsService', () => {
  let service: EventsService;
  let repo: Repository<Event>;
  let eventStateService: { validateTransition: jest.Mock };
  let escrowService: { createEscrow: jest.Mock };

  beforeEach(async () => {
    eventStateService = { validateTransition: jest.fn() };
    escrowService = { createEscrow: jest.fn().mockResolvedValue('GESCROW123') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(Event), useValue: mockRepo },
        { provide: getRepositoryToken(User), useValue: mockRepo },
        { provide: getRepositoryToken(TicketEntity), useValue: mockRepo },
        { provide: EventStateService, useValue: eventStateService },
        {
          provide: NotificationService,
          useValue: {
            queueEventCancelledEmail: jest.fn(),
            queueEventPublishedEmail: jest.fn(),
            queueEventCompletedEmail: jest.fn(),
          },
        },
        { provide: EscrowService, useValue: escrowService },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    repo = module.get<Repository<Event>>(getRepositoryToken(Event));
    jest.clearAllMocks();
  });

  describe('createEvent', () => {
    it('should create and return an event for an organizer', async () => {
      const dto: CreateEventDto = {
        title: 'Test Event',
        startDate: '2025-06-01',
        endDate: '2025-06-02',
        ticketPrice: 10,
      };
      mockRepo.create.mockReturnValue(mockEvent);
      mockRepo.save.mockResolvedValue(mockEvent);

      const result = await service.createEvent(dto, 'organizer-1');

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizerId: 'organizer-1' }),
      );
      expect(result).toEqual(mockEvent);
    });
  });

  describe('updateEvent', () => {
    it('should update and persist changes', async () => {
      mockRepo.findOne.mockResolvedValue({ ...mockEvent });
      const updated = { ...mockEvent, title: 'Updated Title' };
      mockRepo.save.mockResolvedValue(updated);

      const result = await service.updateEvent(
        'uuid-1',
        {
          title: 'Updated Title',
        },
        'organizer-1',
      );

      expect(result.title).toBe('Updated Title');
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if event does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateEvent('non-existent', { title: 'New' }, 'caller-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('routes publishing through escrow setup', async () => {
      const draftEvent = { ...mockEvent, status: EventStatus.DRAFT };
      const publishedEvent = {
        ...draftEvent,
        status: EventStatus.PUBLISHED,
        escrowPublicKey: 'GESCROW123',
      };

      mockRepo.findOne
        .mockResolvedValueOnce(draftEvent)
        .mockResolvedValueOnce({ ...draftEvent })
        .mockResolvedValueOnce(publishedEvent);
      mockRepo.save
        .mockResolvedValueOnce(draftEvent)
        .mockResolvedValueOnce(publishedEvent);

      const result = await service.updateEvent(
        'uuid-1',
        { status: EventStatus.PUBLISHED },
        'organizer-1',
      );

      expect(eventStateService.validateTransition).toHaveBeenCalledWith(
        EventStatus.DRAFT,
        EventStatus.PUBLISHED,
      );
      expect(escrowService.createEscrow).toHaveBeenCalledWith('uuid-1');
      expect(result.escrowPublicKey).toBe('GESCROW123');
    });
  });

  describe('publishEvent', () => {
    it('publishes an event and provisions escrow credentials', async () => {
      const draftEvent = { ...mockEvent, status: EventStatus.DRAFT };
      const publishedEvent = {
        ...draftEvent,
        status: EventStatus.PUBLISHED,
        escrowPublicKey: 'GESCROW123',
      };

      mockRepo.findOne
        .mockResolvedValueOnce(draftEvent)
        .mockResolvedValueOnce(publishedEvent);
      mockRepo.save.mockResolvedValueOnce({
        ...draftEvent,
        status: EventStatus.PUBLISHED,
      });

      const result = await service.publishEvent('uuid-1', 'organizer-1');

      expect(escrowService.createEscrow).toHaveBeenCalledWith('uuid-1');
      expect(result.status).toBe(EventStatus.PUBLISHED);
      expect(result.escrowPublicKey).toBe('GESCROW123');
    });
  });

  describe('deleteEvent', () => {
    it('should delete the event', async () => {
      mockRepo.findOne.mockResolvedValue(mockEvent);
      mockRepo.remove.mockResolvedValue(mockEvent);

      await service.deleteEvent('uuid-1', 'organizer-1');

      expect(mockRepo.remove).toHaveBeenCalledWith(mockEvent);
    });
  });

  describe('getEventById', () => {
    it('should return an event by id', async () => {
      mockRepo.findOne.mockResolvedValue(mockEvent);
      const result = await service.getEventById('uuid-1');
      expect(result).toEqual(mockEvent);
    });

    it('should throw NotFoundException if not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.getEventById('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listEvents', () => {
    it('should return paginated results', async () => {
      mockRepo.findAndCount.mockResolvedValue([[mockEvent], 1]);

      const dto: ListEventsDto = { page: 1, limit: 10 };
      const result = await service.listEvents(dto);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should filter by status', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);

      const dto: ListEventsDto = {
        status: EventStatus.PUBLISHED,
        page: 1,
        limit: 10,
      };
      await service.listEvents(dto);

      expect(mockRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining<Parameters<typeof mockRepo.findAndCount>[0]>({
          where: expect.objectContaining({
            status: EventStatus.PUBLISHED,
          }) as FindOptionsWhere<Event>,
        }),
      );
    });
  });
});
