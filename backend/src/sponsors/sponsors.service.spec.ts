import { Test, TestingModule } from '@nestjs/testing';
import { SponsorsService } from './sponsors.service';
import { EventsService } from '../events/events.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SponsorTier } from './entities/sponsor-tier.entity';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('SponsorsService', () => {
  let service: SponsorsService;
  let tierRepo: any;
  let eventsService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SponsorsService,
        {
          provide: getRepositoryToken(SponsorTier),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: EventsService,
          useValue: { getEventById: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<SponsorsService>(SponsorsService);
    tierRepo = module.get(getRepositoryToken(SponsorTier));
    eventsService = module.get(EventsService);
  });

  describe('createTier', () => {
    it('should throw ForbiddenException if requester is not organizer', async () => {
      eventsService.getEventById.mockResolvedValue({ organizerId: 'other' });
      await expect(service.createTier('event-1', {} as any, 'req-id')).rejects.toThrow(ForbiddenException);
    });

    it('should create and save tier', async () => {
      eventsService.getEventById.mockResolvedValue({ organizerId: 'req-id' });
      const dto = { name: 'Tier 1', price: 100 } as any;
      tierRepo.create.mockReturnValue({ ...dto, eventId: 'event-1' });
      tierRepo.save.mockResolvedValue({ id: 't1', ...dto, eventId: 'event-1' });

      const result = await service.createTier('event-1', dto, 'req-id');
      expect(result).toEqual({ id: 't1', ...dto, eventId: 'event-1' });
      expect(tierRepo.save).toHaveBeenCalled();
    });
  });

  describe('updateTier', () => {
    it('should throw NotFoundException if tier not found', async () => {
      tierRepo.findOne.mockResolvedValue(null);
      await expect(service.updateTier('t1', {} as any, 'req')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not organizer', async () => {
      tierRepo.findOne.mockResolvedValue({ eventId: 'e1' });
      eventsService.getEventById.mockResolvedValue({ organizerId: 'other' });
      await expect(service.updateTier('t1', {} as any, 'req')).rejects.toThrow(ForbiddenException);
    });

    it('should update and save tier', async () => {
      const tier = { id: 't1', eventId: 'e1', name: 'Old' };
      tierRepo.findOne.mockResolvedValue(tier);
      eventsService.getEventById.mockResolvedValue({ organizerId: 'req' });
      tierRepo.save.mockResolvedValue({ ...tier, name: 'New' });

      const result = await service.updateTier('t1', { name: 'New' } as any, 'req');
      expect(result.name).toBe('New');
      expect(tierRepo.save).toHaveBeenCalledWith({ id: 't1', eventId: 'e1', name: 'New' });
    });
  });

  describe('deleteTier', () => {
    it('should throw NotFoundException if tier not found', async () => {
      tierRepo.findOne.mockResolvedValue(null);
      await expect(service.deleteTier('t1', 'req')).rejects.toThrow(NotFoundException);
    });

    it('should delete tier if organizer', async () => {
      const tier = { id: 't1', eventId: 'e1' };
      tierRepo.findOne.mockResolvedValue(tier);
      eventsService.getEventById.mockResolvedValue({ organizerId: 'req' });

      await service.deleteTier('t1', 'req');
      expect(tierRepo.remove).toHaveBeenCalledWith(tier);
    });
  });

  describe('listTiers', () => {
    it('should list tiers for event', async () => {
      tierRepo.find.mockResolvedValue([{ id: 't1' }]);
      const result = await service.listTiers('e1');
      expect(result).toEqual([{ id: 't1' }]);
    });
  });

  describe('getTierById', () => {
    it('should throw NotFoundException if not found', async () => {
      tierRepo.findOne.mockResolvedValue(null);
      await expect(service.getTierById('t1')).rejects.toThrow(NotFoundException);
    });

    it('should return tier', async () => {
      tierRepo.findOne.mockResolvedValue({ id: 't1' });
      const result = await service.getTierById('t1');
      expect(result).toEqual({ id: 't1' });
    });
  });
});
