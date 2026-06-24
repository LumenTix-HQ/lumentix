import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FindOptionsWhere, Repository } from 'typeorm';
import { EventsService } from './events.service';
import { Event, EventStatus, EventCategory, EventAgeRestriction } from './entities/event.entity';
import { EventHistory } from './entities/event-history.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { HistoricalAnalysisDto } from './dto/historical-analysis.dto';
import { EventStateService } from './state/event-state.service';
import { User } from '../users/entities/user.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Payment } from '../payments/entities/payment.entity';
import { SponsorContribution } from '../sponsors/entities/sponsor-contribution.entity';
import { NotificationService } from '../notifications/notification.service';
import { EscrowService } from '../payments/services/escrow.service';
import { AuditService } from '../audit/audit.service';
import { EventCacheService } from './cache/event-cache.service';
import { CurrenciesService } from '../currencies/currencies.service';
import { EventImage } from './entities/event-image.entity';
import { EventSeries } from './entities/event-series.entity';

// Mock the entire RefundService module to avoid parsing broken dependencies
jest.mock('../payments/refunds/refund.service', () => ({
  RefundService: jest.fn().mockImplementation(() => ({
    refundEvent: jest.fn(),
    refundSinglePayment: jest.fn(),
    processEventRefunds: jest.fn(),
    getRefundStatus: jest.fn(),
  })),
}));
import { RefundService } from '../payments/refunds/refund.service';

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
  seriesId: null,
  imageUrl: null,
  category: EventCategory.OTHER,
  fundingGoal: null,
  ageRestriction: EventAgeRestriction.NONE,
  cancellationReason: null,
  cancellationDetails: null,
  cancelledAt: null,
  archivedAt: null,
  categories: [],
  mergedAt: null,
  webhookUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const createMockQueryBuilder = (returnValue: any) => ({
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  innerJoinAndSelect: jest.fn().mockReturnThis(),
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getRawMany: jest.fn().mockResolvedValue(returnValue),
  getRawOne: jest.fn().mockResolvedValue(returnValue),
  getManyAndCount: jest.fn().mockResolvedValue([returnValue, returnValue.length ?? 0]),
  getCount: jest.fn().mockResolvedValue(0),
});

const mockRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  remove: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  createQueryBuilder: jest.fn(),
};

const mockHistoryRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(),
};

describe('EventsService', () => {
  let service: EventsService;
  let repo: Repository<Event>;
  let historyRepo: Repository<EventHistory>;
  let eventStateService: { validateTransition: jest.Mock };
  let escrowService: { createEscrow: jest.Mock };
  let auditService: { log: jest.Mock };
  let ticketRepo: Repository<TicketEntity>;
  let paymentRepo: Repository<Payment>;
  let contributionRepo: Repository<SponsorContribution>;

  const completedEvent: Event = {
    ...mockEvent,
    status: EventStatus.COMPLETED,
  };

  beforeEach(async () => {
    eventStateService = { validateTransition: jest.fn() };
    escrowService = { createEscrow: jest.fn().mockResolvedValue('GESCROW123') };
    auditService = { log: jest.fn().mockResolvedValue({}) };

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(Event), useValue: mockRepo },
        { provide: getRepositoryToken(EventHistory), useValue: mockHistoryRepo },
        { provide: getRepositoryToken(User), useValue: mockRepo },
        { provide: getRepositoryToken(TicketEntity), useValue: mockRepo },
        { provide: getRepositoryToken(Payment), useValue: mockRepo },
        { provide: getRepositoryToken(SponsorContribution), useValue: mockRepo },
        { provide: EventStateService, useValue: eventStateService },
        {
          provide: NotificationService,
          useValue: {
            queueLifecycleEmail: jest.fn(),
          },
        },
        { provide: EscrowService, useValue: escrowService },
        { provide: AuditService, useValue: auditService },
        {
          provide: getRepositoryToken(EventImage),
          useValue: { create: jest.fn(), save: jest.fn(), count: jest.fn(), update: jest.fn(), delete: jest.fn() },
        },
        {
          provide: EventCacheService,
          useValue: { fetchCachedMetadata: jest.fn().mockResolvedValue(null), cacheEventMetadata: jest.fn(), invalidateCacheEntry: jest.fn() },
        },
        {
          provide: RefundService,
          useValue: { refundEvent: jest.fn() },
        },
        {
          provide: CurrenciesService,
          useValue: { findActiveCodes: jest.fn().mockResolvedValue(['USD', 'EUR']) },
        },
        {
          provide: getRepositoryToken(EventSeries),
          useValue: { create: jest.fn(), save: jest.fn(), findOne: jest.fn(), find: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    repo = module.get<Repository<Event>>(getRepositoryToken(Event));
    historyRepo = module.get<Repository<EventHistory>>(getRepositoryToken(EventHistory));
    ticketRepo = module.get<Repository<TicketEntity>>(getRepositoryToken(TicketEntity));
    paymentRepo = module.get<Repository<Payment>>(getRepositoryToken(Payment));
    contributionRepo = module.get<Repository<SponsorContribution>>(getRepositoryToken(SponsorContribution));
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

      expect(mockRepo.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'uuid-1' }),
      );
    });
  });

  describe('getEventById', () => {
    it('should return an event by id with capacity info', async () => {
      mockRepo.findOne.mockResolvedValue(mockEvent);
      mockRepo.count.mockResolvedValue(0);
      const result = await service.getEventById('uuid-1');
      expect(result.id).toBe('uuid-1');
      expect(result.soldTickets).toBe(0);
      expect(result.remainingCapacity).toBe(100);
    });

    it('should throw NotFoundException if not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.getEventById('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listEvents', () => {
    const mockQb = () => {
      const qb: any = {
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawAndEntities: jest.fn().mockResolvedValue({
          raw: [{ soldTickets: '5' }],
          entities: [mockEvent],
        }),
        getCount: jest.fn().mockResolvedValue(1),
      };
      return qb;
    };

    beforeEach(() => {
      mockRepo.createQueryBuilder.mockReturnValue(mockQb());
    });

    it('should return paginated results', async () => {
      const dto: ListEventsDto = { page: 1, limit: 10 };
      const result = await service.listEvents(dto);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should filter by status', async () => {
      const qb = mockQb();
      qb.getRawAndEntities.mockResolvedValue({ raw: [], entities: [] });
      qb.getCount.mockResolvedValue(0);
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const dto: ListEventsDto = {
        status: EventStatus.PUBLISHED,
        page: 1,
        limit: 10,
      };
      await service.listEvents(dto);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'event.status = :status',
        { status: EventStatus.PUBLISHED },
      );
    });
  });

  describe('archiveCompletedEvent', () => {
    it('should archive a completed event', async () => {
      const archivedEvent = {
        ...completedEvent,
        status: EventStatus.ARCHIVED,
        archivedAt: new Date(),
      };
      mockRepo.findOne
        .mockResolvedValueOnce(completedEvent)
        .mockResolvedValueOnce(archivedEvent);
      mockRepo.save.mockResolvedValueOnce(archivedEvent);
      mockRepo.createQueryBuilder
        .mockReturnValueOnce(createMockQueryBuilder([]))
        .mockReturnValueOnce(createMockQueryBuilder([]))
        .mockReturnValueOnce(createMockQueryBuilder([]))
        .mockReturnValueOnce(createMockQueryBuilder({ totalRevenue: '0' }));
      mockHistoryRepo.save.mockResolvedValue({ id: 'history-1' });

      const result = await service.archiveCompletedEvent('uuid-1', 'organizer-1');

      expect(result.status).toBe(EventStatus.ARCHIVED);
      expect(result.archivedAt).toBeDefined();
      expect(eventStateService.validateTransition).toHaveBeenCalledWith(
        EventStatus.COMPLETED,
        EventStatus.ARCHIVED,
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EVENT_ARCHIVED' }),
      );
    });

    it('should throw ForbiddenException if caller is not the organizer', async () => {
      mockRepo.findOne.mockResolvedValueOnce(completedEvent);

      await expect(
        service.archiveCompletedEvent('uuid-1', 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if event is not completed', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockEvent);

      await expect(
        service.archiveCompletedEvent('uuid-1', 'organizer-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('preserveEventHistory', () => {
    it('should create a history snapshot for an event', async () => {
      const mockHistory = {
        id: 'history-1',
        eventId: 'uuid-1',
        snapshot: {},
        totalTicketsSold: 10,
        totalTicketsUsed: 5,
        totalRevenue: 100,
        totalSponsorship: 50,
        archivedAt: new Date(),
      };
      mockRepo.findOne.mockResolvedValueOnce(completedEvent);
      mockRepo.createQueryBuilder
        .mockReturnValueOnce(createMockQueryBuilder([{ status: 'valid', count: '10' }, { status: 'used', count: '5' }]))
        .mockReturnValueOnce(createMockQueryBuilder([{ status: 'confirmed', count: '5', totalRevenue: '100' }]))
        .mockReturnValueOnce(createMockQueryBuilder({ totalSponsorship: '50', totalContributions: '2' }))
        .mockReturnValueOnce(createMockQueryBuilder({ totalRevenue: '100' }));
      mockHistoryRepo.create.mockReturnValue(mockHistory);
      mockHistoryRepo.save.mockResolvedValue(mockHistory);

      const result = await service.preserveEventHistory('uuid-1', 'organizer-1');

      expect(mockHistoryRepo.create).toHaveBeenCalled();
      expect(mockHistoryRepo.save).toHaveBeenCalled();
      expect(result).toEqual(mockHistory);
    });

    it('should throw ForbiddenException if caller is not the organizer', async () => {
      mockRepo.findOne.mockResolvedValueOnce(completedEvent);

      await expect(
        service.preserveEventHistory('uuid-1', 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('enableHistoricalAnalysis', () => {
    it('should return paginated history records', async () => {
      const mockHistoryRecords = [
        { id: 'h-1', eventId: 'uuid-1', archivedAt: new Date() },
      ];
      mockHistoryRepo.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockHistoryRecords, 1]),
      });

      const dto: HistoricalAnalysisDto = { page: 1, limit: 10 };
      const result = await service.enableHistoricalAnalysis(dto);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('should filter by organizerId and category', async () => {
      const qbMock = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockHistoryRepo.createQueryBuilder.mockReturnValue(qbMock);

      const dto: HistoricalAnalysisDto = {
        organizerId: 'org-1',
        category: 'concert',
        page: 1,
        limit: 10,
      };
      await service.enableHistoricalAnalysis(dto);

      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'event.organizerId = :organizerId',
        { organizerId: 'org-1' },
      );
      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'event.category = :category',
        { category: 'concert' },
      );
    });

    it('should filter by date range', async () => {
      const qbMock = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockHistoryRepo.createQueryBuilder.mockReturnValue(qbMock);

      const dto: HistoricalAnalysisDto = {
        fromDate: '2024-01-01',
        toDate: '2024-12-31',
        page: 1,
        limit: 10,
      };
      await service.enableHistoricalAnalysis(dto);

      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'eh.archivedAt >= :fromDate',
        { fromDate: expect.any(Date) },
      );
      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'eh.archivedAt <= :toDate',
        { toDate: expect.any(Date) },
      );
    });
  });
});
