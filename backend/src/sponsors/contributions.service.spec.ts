/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { Test, TestingModule } from '@nestjs/testing';
import { ContributionsService } from './contributions.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  SponsorContribution,
  ContributionStatus,
} from './entities/sponsor-contribution.entity';
import { SponsorTier } from './entities/sponsor-tier.entity';
import { StellarService } from 'src/stellar';
import { AuditService } from 'src/audit/audit.service';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { User } from 'src/users/entities/user.entity';
import { Event } from 'src/events/entities/event.entity';
import { NotificationService } from 'src/notifications/notification.service';

describe('ContributionsService', () => {
  let service: ContributionsService;
  let contributionRepo: any;
  let tierRepo: any;
  let stellarService: any;
  let auditService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContributionsService,
        {
          provide: getRepositoryToken(SponsorContribution),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SponsorTier),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Event),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: StellarService,
          useValue: {
            getTransaction: jest.fn(),
            extractAndValidateMemo: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('ESCROW_WALLET') },
        },
        {
          provide: NotificationService,
          useValue: { queueSponsorConfirmedEmail: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ContributionsService>(ContributionsService);
    contributionRepo = module.get(getRepositoryToken(SponsorContribution));
    tierRepo = module.get(getRepositoryToken(SponsorTier));
    stellarService = module.get(StellarService);
    auditService = module.get(AuditService);

    // Mock global fetch securely for these tests
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createIntent', () => {
    it('should throw NotFoundException if tier missing', async () => {
      tierRepo.findOne.mockResolvedValue(null);
      await expect(service.createIntent('t1', 's1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if capacity full', async () => {
      tierRepo.findOne.mockResolvedValue({ id: 't1', maxSponsors: 1 });
      contributionRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
      });
      await expect(service.createIntent('t1', 's1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should create intent successfully', async () => {
      tierRepo.findOne.mockResolvedValue({
        id: 't1',
        maxSponsors: 5,
        price: 100,
      });
      contributionRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      });
      contributionRepo.create.mockReturnValue({
        id: 'c1',
        amount: 100,
        tierId: 't1',
        sponsorId: 's1',
      });
      contributionRepo.save.mockResolvedValue({
        id: 'c1',
        amount: 100,
        tierId: 't1',
        sponsorId: 's1',
      });

      const result = await service.createIntent('t1', 's1');
      expect(result).toEqual({
        contributionId: 'c1',
        escrowWallet: 'ESCROW_WALLET',
        amount: 100,
        currency: 'XLM',
        memo: 'c1',
      });
      expect(auditService.log).toHaveBeenCalled();
    });
  });

  describe('confirmContribution', () => {
    it('should throw BadRequestException if transaction not found', async () => {
      stellarService.getTransaction.mockRejectedValue(new Error('err'));
      await expect(service.confirmContribution('tx1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if memo missing', async () => {
      stellarService.getTransaction.mockResolvedValue({});
      stellarService.extractAndValidateMemo.mockImplementation(() => {
        throw new BadRequestException(
          'Transaction is missing a memo. Cannot correlate with a payment or contribution intent.',
        );
      });
      await expect(service.confirmContribution('tx1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if contribution not pending', async () => {
      stellarService.getTransaction.mockResolvedValue({ memo: 'c1' });
      stellarService.extractAndValidateMemo.mockReturnValue('c1');
      contributionRepo.findOne.mockResolvedValue(null);
      await expect(service.confirmContribution('tx1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should confirm contribution if all valid', async () => {
      stellarService.getTransaction.mockResolvedValue({
        memo: 'c1',
        _links: { operations: { href: 'http://ops' } },
      });
      stellarService.extractAndValidateMemo.mockReturnValue('c1');
      contributionRepo.findOne.mockResolvedValue({
        id: 'c1',
        amount: 100,
        tier: { id: 't1', maxSponsors: 5 },
      });
      (global as any).fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          _embedded: {
            records: [
              {
                type: 'payment',
                to: 'ESCROW_WALLET',
                amount: '100.00',
                asset_type: 'native',
              },
            ],
          },
        }),
      });

      contributionRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      });

      contributionRepo.save.mockImplementation(async (x: any) => x);

      const result = await service.confirmContribution('tx1');
      expect(result.status).toBe(ContributionStatus.CONFIRMED);
      expect(result.transactionHash).toBe('tx1');
      expect(auditService.log).toHaveBeenCalled();
    });
  });
});
