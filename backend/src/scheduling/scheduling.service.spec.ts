import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchedulingService } from './scheduling.service';
import { Event, EventCategory } from '../events/entities/event.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Registration } from '../registrations/entities/registration.entity';

describe('SchedulingService', () => {
  let service: SchedulingService;
  let eventRepository: Repository<Event>;
  let ticketRepository: Repository<TicketEntity>;
  let paymentRepository: Repository<Payment>;
  let registrationRepository: Repository<Registration>;

  const mockEventRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockTicketRepository = {
    count: jest.fn(),
  };

  const mockPaymentRepository = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockRegistrationRepository = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingService,
        {
          provide: getRepositoryToken(Event),
          useValue: mockEventRepository,
        },
        {
          provide: getRepositoryToken(TicketEntity),
          useValue: mockTicketRepository,
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: mockPaymentRepository,
        },
        {
          provide: getRepositoryToken(Registration),
          useValue: mockRegistrationRepository,
        },
      ],
    }).compile();

    service = module.get<SchedulingService>(SchedulingService);
    eventRepository = module.get<Repository<Event>>(getRepositoryToken(Event));
    ticketRepository = module.get<Repository<TicketEntity>>(getRepositoryToken(TicketEntity));
    paymentRepository = module.get<Repository<Payment>>(getRepositoryToken(Payment));
    registrationRepository = module.get<Repository<Registration>>(getRepositoryToken(Registration));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('analyzeOptimalTiming', () => {
    it('should return optimal timing analysis', async () => {
      const mockEvents = [
        {
          id: '1',
          category: EventCategory.CONFERENCE,
          location: 'San Francisco',
          startDate: new Date('2024-06-15'),
          createdAt: new Date('2024-01-01'),
        },
      ];

      mockEventRepository.find.mockResolvedValue(mockEvents);
      mockTicketRepository.count.mockResolvedValue(100);
      
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: 5000 }),
      };
      mockPaymentRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.analyzeOptimalTiming(
        EventCategory.CONFERENCE,
        'San Francisco',
        2,
        'professionals'
      );

      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.factors).toBeDefined();
      expect(result.reasoning).toBeInstanceOf(Array);
      expect(result.recommendedStartDate).toBeInstanceOf(Date);
      expect(result.recommendedEndDate).toBeInstanceOf(Date);
    });

    it('should handle empty historical data', async () => {
      mockEventRepository.find.mockResolvedValue([]);

      const result = await service.analyzeOptimalTiming(
        EventCategory.WORKSHOP,
        'New York',
        3,
        'young-adults'
      );

      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('suggestEventSchedule', () => {
    it('should return schedule suggestions', async () => {
      mockEventRepository.count.mockResolvedValue(1);

      const result = await service.suggestEventSchedule(
        EventCategory.NETWORKING,
        'Austin',
        2,
        {
          start: new Date('2024-06-01'),
          end: new Date('2024-06-30'),
        }
      );

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('timeSlot');
      expect(result[0]).toHaveProperty('expectedAttendance');
      expect(result[0]).toHaveProperty('revenueProjection');
      expect(result[0]).toHaveProperty('competitionLevel');
      expect(result[0]).toHaveProperty('confidence');
    });
  });

  describe('predictAttendanceImpact', () => {
    it('should predict attendance impact for schedule changes', async () => {
      const mockEvent = {
        id: '1',
        category: EventCategory.CONCERT,
        location: 'Los Angeles',
        organizerId: 'org1',
      };

      mockEventRepository.findOne.mockResolvedValue(mockEvent);
      mockEventRepository.find.mockResolvedValue([mockEvent]);
      mockTicketRepository.count.mockResolvedValue(150);
      mockEventRepository.count.mockResolvedValue(2);

      const result = await service.predictAttendanceImpact(
        '1',
        new Date('2024-07-15T19:00:00Z'),
        new Date('2024-07-15T22:00:00Z')
      );

      expect(result).toBeDefined();
      expect(result.baselineAttendance).toBeGreaterThan(0);
      expect(result.projectedAttendance).toBeGreaterThan(0);
      expect(result.impactFactors).toBeDefined();
      expect(result.riskFactors).toBeInstanceOf(Array);
      expect(result.opportunities).toBeInstanceOf(Array);
    });

    it('should throw error for non-existent event', async () => {
      mockEventRepository.findOne.mockResolvedValue(null);

      await expect(
        service.predictAttendanceImpact(
          'non-existent',
          new Date(),
          new Date()
        )
      ).rejects.toThrow('Event not found');
    });
  });

  describe('seasonal analysis', () => {
    it('should calculate seasonal patterns correctly', async () => {
      const mockHistoricalData = [
        {
          startDate: new Date('2024-06-15'),
          ticketsSold: 100,
          revenue: 5000,
        },
        {
          startDate: new Date('2024-07-15'),
          ticketsSold: 120,
          revenue: 6000,
        },
        {
          startDate: new Date('2024-06-20'),
          ticketsSold: 90,
          revenue: 4500,
        },
      ];

      // Test the private method indirectly through analyzeOptimalTiming
      mockEventRepository.find.mockResolvedValue(mockHistoricalData);
      mockTicketRepository.count.mockResolvedValue(100);
      
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: 5000 }),
      };
      mockPaymentRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.analyzeOptimalTiming(
        EventCategory.CONFERENCE,
        'Test Location',
        2
      );

      expect(result.factors.seasonalScore).toBeGreaterThan(0);
      expect(result.factors.seasonalScore).toBeLessThanOrEqual(1);
    });
  });

  describe('competition analysis', () => {
    it('should analyze competition levels correctly', async () => {
      // Test low competition
      mockEventRepository.count.mockResolvedValue(1);
      mockEventRepository.find.mockResolvedValue([]);
      mockTicketRepository.count.mockResolvedValue(50);
      
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: 2500 }),
      };
      mockPaymentRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.analyzeOptimalTiming(
        EventCategory.WORKSHOP,
        'Test Location',
        3
      );

      expect(result.factors.competitionScore).toBeGreaterThan(0);
    });
  });

  describe('demographic factors', () => {
    it('should handle different target audiences', async () => {
      mockEventRepository.find.mockResolvedValue([]);
      mockTicketRepository.count.mockResolvedValue(0);
      
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: 0 }),
      };
      mockPaymentRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const audiences = ['young-adults', 'families', 'professionals', 'seniors'];
      
      for (const audience of audiences) {
        const result = await service.analyzeOptimalTiming(
          EventCategory.NETWORKING,
          'Test Location',
          2,
          audience
        );

        expect(result.factors.demographicScore).toBeGreaterThan(0);
        expect(result.reasoning).toContain(`Optimized for ${audience} preferences`);
      }
    });
  });
});
