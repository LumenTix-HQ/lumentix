import { Test, TestingModule } from '@nestjs/testing';
import { SponsorsService } from './sponsors.service';
import { EventsService } from '../events/events.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SponsorTier } from './entities/sponsor-tier.entity';
import { SponsorContribution } from './entities/sponsor-contribution.entity';
import { Event, EventStatus } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ContributionsService } from './contributions.service';
import { EscrowService } from '../payments/services/escrow.service';
import { StellarService } from '../stellar/stellar.service';
import { AuditService } from '../audit/audit.service';

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

// ─── getFundingProgress and distributeEscrow — full provider setup ─────────

describe('SponsorsService — funding progress and escrow distribution', () => {
  let service: SponsorsService;
  let eventsService: any;
  let contributionRepo: any;
  let eventRepo: any;
  let usersRepo: any;
  let escrowService: any;
  let stellarService: any;
  let auditService: any;

  const mockQb = () => ({
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
  });

  beforeEach(async () => {
    eventsService = { getEventById: jest.fn() };
    contributionRepo = { createQueryBuilder: jest.fn(), findOne: jest.fn(), save: jest.fn() };
    eventRepo = { findOne: jest.fn() };
    usersRepo = { findOne: jest.fn() };
    escrowService = { decryptEscrowSecret: jest.fn() };
    stellarService = { sendPayment: jest.fn() };
    auditService = { log: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SponsorsService,
        { provide: getRepositoryToken(SponsorTier), useValue: { findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn(), remove: jest.fn() } },
        { provide: getRepositoryToken(SponsorContribution), useValue: contributionRepo },
        { provide: getRepositoryToken(Event), useValue: eventRepo },
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: EventsService, useValue: eventsService },
        { provide: ContributionsService, useValue: { confirmContribution: jest.fn() } },
        { provide: EscrowService, useValue: escrowService },
        { provide: StellarService, useValue: stellarService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(SponsorsService);
  });

  describe('getFundingProgress()', () => {
    it('returns raised amount, percentage, and goalReached when fundingGoal is set', async () => {
      eventsService.getEventById.mockResolvedValue({ id: 'e1', fundingGoal: 1000 });
      const qb = mockQb();
      qb.getRawOne
        .mockResolvedValueOnce({ total: '500' })   // totalRaised
        .mockResolvedValueOnce({ count: '3' });     // contributorCount
      contributionRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getFundingProgress('e1');

      expect(result.raised).toBe(500);
      expect(result.goal).toBe(1000);
      expect(result.percentage).toBe(50);
      expect(result.goalReached).toBe(false);
      expect(result.contributorCount).toBe(3);
    });

    it('returns goalReached: true when raised >= goal', async () => {
      eventsService.getEventById.mockResolvedValue({ id: 'e1', fundingGoal: 500 });
      const qb = mockQb();
      qb.getRawOne
        .mockResolvedValueOnce({ total: '600' })
        .mockResolvedValueOnce({ count: '5' });
      contributionRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getFundingProgress('e1');

      expect(result.goalReached).toBe(true);
      expect(result.percentage).toBe(100);
    });

    it('returns null goal and percentage when event has no fundingGoal', async () => {
      eventsService.getEventById.mockResolvedValue({ id: 'e1', fundingGoal: null });
      const qb = mockQb();
      qb.getRawOne
        .mockResolvedValueOnce({ total: '200' })
        .mockResolvedValueOnce({ count: '2' });
      contributionRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getFundingProgress('e1');

      expect(result.goal).toBeNull();
      expect(result.percentage).toBeNull();
      expect(result.goalReached).toBe(false);
    });
  });

  describe('distributeEscrow()', () => {
    const COMPLETED_EVENT = {
      id: 'e1',
      organizerId: 'org-1',
      status: EventStatus.COMPLETED,
      escrowPublicKey: 'ESCROW_PUB',
    };

    it('throws ForbiddenException when caller is not organizer or admin', async () => {
      eventsService.getEventById.mockResolvedValue(COMPLETED_EVENT);

      await expect(
        service.distributeEscrow('e1', 'other-user', 'event_goer' as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when event is not COMPLETED', async () => {
      eventsService.getEventById.mockResolvedValue({
        ...COMPLETED_EVENT,
        status: EventStatus.PUBLISHED,
      });

      await expect(
        service.distributeEscrow('e1', 'org-1', 'organizer' as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when organizer has no Stellar wallet', async () => {
      eventsService.getEventById.mockResolvedValue(COMPLETED_EVENT);
      eventRepo.findOne.mockResolvedValue({ ...COMPLETED_EVENT, escrowSecretEncrypted: 'iv:tag:cipher' });
      usersRepo.findOne.mockResolvedValue({ id: 'org-1', stellarPublicKey: null });
      const qb = mockQb();
      qb.getRawOne.mockResolvedValue({ total: '100' });
      contributionRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.distributeEscrow('e1', 'org-1', 'organizer' as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('calls StellarService.sendPayment and logs audit on success', async () => {
      eventsService.getEventById.mockResolvedValue(COMPLETED_EVENT);
      eventRepo.findOne.mockResolvedValue({ ...COMPLETED_EVENT, escrowSecretEncrypted: 'iv:tag:cipher' });
      usersRepo.findOne.mockResolvedValue({ id: 'org-1', stellarPublicKey: 'GORG_PUB' });
      const qb = mockQb();
      qb.getRawOne.mockResolvedValue({ total: '500' });
      contributionRepo.createQueryBuilder.mockReturnValue(qb);
      escrowService.decryptEscrowSecret.mockResolvedValue('raw-secret');
      stellarService.sendPayment.mockResolvedValue({ hash: 'tx-distribute' });

      const result = await service.distributeEscrow('e1', 'org-1', 'organizer' as any);

      expect(stellarService.sendPayment).toHaveBeenCalledWith(
        'raw-secret', 'GORG_PUB', '500', 'XLM',
      );
      expect(result.transactionHash).toBe('tx-distribute');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ESCROW_RELEASED' }),
      );
    });
  });
});
