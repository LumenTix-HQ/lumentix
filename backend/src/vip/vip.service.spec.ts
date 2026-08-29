import { Test, TestingModule } from '@nestjs/testing';
import { VipService } from './vip.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { VipTier } from './entities/vip-tier.entity';
import { VipAssignment } from './entities/vip-assignment.entity';
import { EventsService } from '../events/events.service';
import { TicketsService } from '../tickets/tickets.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

describe('VipService', () => {
  let service: VipService;
  let mockTierRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let mockAssignmentRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let mockEventsService: { getEventById: jest.Mock };
  let mockTicketsService: { getTicketById: jest.Mock };

  beforeEach(async () => {
    mockTierRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((dto) => ({ ...dto, id: 'tier1', filledSlots: 0 })),
      save: jest.fn((t) => Promise.resolve(t)),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    mockAssignmentRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((dto) => ({ ...dto, id: 'a1' })),
      save: jest.fn((a) => Promise.resolve(a)),
    };
    mockEventsService = { getEventById: jest.fn() };
    mockTicketsService = { getTicketById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VipService,
        { provide: getRepositoryToken(VipTier), useValue: mockTierRepo },
        { provide: getRepositoryToken(VipAssignment), useValue: mockAssignmentRepo },
        { provide: EventsService, useValue: mockEventsService },
        { provide: TicketsService, useValue: mockTicketsService },
      ],
    }).compile();

    service = module.get<VipService>(VipService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTier', () => {
    it('should create a tier when organizer is authorized', async () => {
      mockEventsService.getEventById.mockResolvedValue({ id: 'e1', organizerId: 'org1' });
      mockTierRepo.findOne.mockResolvedValue(null);

      const result = await service.createTier('e1', { name: 'Gold', price: 100, maxSlots: 10 } as any, 'org1');

      expect(result.id).toBe('tier1');
      expect(mockTierRepo.save).toHaveBeenCalled();
    });

    it('should throw ForbiddenException for non-organizer', async () => {
      mockEventsService.getEventById.mockResolvedValue({ id: 'e1', organizerId: 'org1' });

      await expect(
        service.createTier('e1', { name: 'Gold', price: 100, maxSlots: 10 } as any, 'other'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for duplicate tier name', async () => {
      mockEventsService.getEventById.mockResolvedValue({ id: 'e1', organizerId: 'org1' });
      mockTierRepo.findOne.mockResolvedValue({ id: 'existing', name: 'Gold' });

      await expect(
        service.createTier('e1', { name: 'Gold', price: 100, maxSlots: 10 } as any, 'org1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getTierById', () => {
    it('should throw NotFoundException when tier not found', async () => {
      mockTierRepo.findOne.mockResolvedValue(null);

      await expect(service.getTierById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('validateAccess', () => {
    it('should return true when ticket has matching tier assignment', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue({
        ticketId: 't1',
        tier: { name: 'Gold' },
      });

      const result = await service.validateAccess('t1', 'Gold');
      expect(result).toBe(true);
    });

    it('should return false when no assignment exists', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue(null);

      const result = await service.validateAccess('t1', 'Gold');
      expect(result).toBe(false);
    });
  });
});
