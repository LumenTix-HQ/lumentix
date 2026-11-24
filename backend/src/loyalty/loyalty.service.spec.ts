import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, LessThan } from 'typeorm';
import {
  DEFAULT_INACTIVITY_EXPIRY_DAYS,
  LoyaltyService,
} from './loyalty.service';
import { LoyaltyAccount } from './entities/loyalty-account.entity';
import {
  LoyaltyTransaction,
  LoyaltyTransactionType,
} from './entities/loyalty-transaction.entity';
import { LoyaltyDiscount } from './entities/loyalty-discount.entity';
import { NotificationService } from '../notifications/notification.service';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeAccount(overrides: Partial<LoyaltyAccount> = {}): LoyaltyAccount {
  return {
    id: 'acc1',
    userId: 'u1',
    pointsBalance: 0,
    totalPointsEarned: 0,
    totalPointsRedeemed: 0,
    currentTier: 'Bronze',
    lastActivityAt: new Date(),
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  } as LoyaltyAccount;
}

describe('LoyaltyService — tiers and expiry (#1433)', () => {
  let service: LoyaltyService;
  let accounts: Map<string, LoyaltyAccount>;
  let accountRepo: any;
  let em: any;
  let notificationService: { queueTierChangeEmail: jest.Mock };
  let configGet: jest.Mock;

  beforeEach(async () => {
    accounts = new Map();
    const store = (a: LoyaltyAccount) => {
      accounts.set(a.userId, { ...a });
      return Promise.resolve(a);
    };

    accountRepo = {
      findOne: jest.fn(({ where }) =>
        Promise.resolve(
          accounts.has(where.userId)
            ? { ...accounts.get(where.userId)! }
            : null,
        ),
      ),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(store),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    em = {
      findOne: jest.fn((_entity, { where }) =>
        Promise.resolve(
          accounts.has(where.userId)
            ? { ...accounts.get(where.userId)! }
            : null,
        ),
      ),
      create: jest.fn((_entity, data) => ({ ...data })),
      save: jest.fn((entity, data) =>
        entity === LoyaltyAccount
          ? store(data)
          : Promise.resolve({ id: 'row1', ...data }),
      ),
    };
    const dataSource = { transaction: jest.fn((cb) => cb(em)) };
    notificationService = {
      queueTierChangeEmail: jest.fn().mockResolvedValue(undefined),
    };
    configGet = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoyaltyService,
        { provide: getRepositoryToken(LoyaltyAccount), useValue: accountRepo },
        {
          provide: getRepositoryToken(LoyaltyTransaction),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(LoyaltyDiscount),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
          },
        },
        { provide: DataSource, useValue: dataSource },
        { provide: NotificationService, useValue: notificationService },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    service = module.get(LoyaltyService);
  });

  describe('evaluate_tier_status', () => {
    it.each([
      [0, 'Bronze'],
      [499, 'Bronze'],
      [500, 'Silver'],
      [1499, 'Silver'],
      [1500, 'Gold'],
      [4999, 'Gold'],
      [5000, 'Platinum'],
    ])('balance %i is %s', async (balance, tier) => {
      accounts.set(
        'u1',
        makeAccount({ pointsBalance: balance, currentTier: 'Bronze' }),
      );

      const result = await service.evaluateTierStatus('u1');

      expect(result.currentTier).toBe(tier);
      expect(accounts.get('u1')!.currentTier).toBe(tier);
    });

    it('does not notify when the tier is unchanged', async () => {
      accounts.set(
        'u1',
        makeAccount({ pointsBalance: 600, currentTier: 'Silver' }),
      );

      const result = await service.evaluateTierStatus('u1');

      expect(result.changed).toBe(false);
      expect(notificationService.queueTierChangeEmail).not.toHaveBeenCalled();
    });
  });

  describe('automatic promotion and demotion', () => {
    it('promotes as soon as earned points cross a threshold, and notifies', async () => {
      accounts.set(
        'u1',
        makeAccount({ pointsBalance: 450, totalPointsEarned: 450 }),
      );

      await service.awardLoyaltyPoints({ userId: 'u1', points: 100 });

      expect(accounts.get('u1')).toMatchObject({
        pointsBalance: 550,
        currentTier: 'Silver',
      });
      expect(notificationService.queueTierChangeEmail).toHaveBeenCalledWith({
        userId: 'u1',
        previousTier: 'Bronze',
        newTier: 'Silver',
      });
    });

    it('demotes when redeeming drops the balance below the tier threshold', async () => {
      accounts.set(
        'u1',
        makeAccount({
          pointsBalance: 1600,
          totalPointsEarned: 1600,
          currentTier: 'Gold',
        }),
      );
      jest
        .spyOn(service as any, 'generateDiscountCode')
        .mockResolvedValue('LOYALTY-ABCD-EFGH');

      await service.redeemPointsForDiscount('u1', { points: 200 });

      expect(accounts.get('u1')).toMatchObject({
        pointsBalance: 1400,
        currentTier: 'Silver',
      });
      expect(notificationService.queueTierChangeEmail).toHaveBeenCalledWith({
        userId: 'u1',
        previousTier: 'Gold',
        newTier: 'Silver',
      });
    });

    it('a failed notification never fails the award', async () => {
      notificationService.queueTierChangeEmail.mockRejectedValue(
        new Error('queue down'),
      );
      accounts.set('u1', makeAccount({ pointsBalance: 450 }));

      await expect(
        service.awardLoyaltyPoints({ userId: 'u1', points: 100 }),
      ).resolves.toBeDefined();
      expect(accounts.get('u1')!.currentTier).toBe('Silver');
    });

    it('tier perks follow the active tier, so a demoted account loses them', async () => {
      accounts.set(
        'u1',
        makeAccount({
          pointsBalance: 100,
          totalPointsEarned: 6000,
          currentTier: 'Bronze',
        }),
      );

      const discount = await service.applyTierDiscounts('u1', 'e1');
      const status = await service.getUserLoyaltyStatus('u1');

      expect(discount).toMatchObject({
        tier: 'Bronze',
        discountPercent: 0,
        discountApplied: false,
      });
      expect(status.tier.name).toBe('Bronze');
    });
  });

  describe('expire_stale_points', () => {
    const now = new Date('2026-10-18T00:00:00Z');

    function staleAccountsQuery(stale: LoyaltyAccount[]) {
      accountRepo.find.mockImplementation(({ where }) => {
        const cutoff: Date = where.lastActivityAt.value;
        return Promise.resolve(
          stale.filter((a) => a.lastActivityAt && a.lastActivityAt < cutoff),
        );
      });
    }

    it('uses the configured inactivity period', async () => {
      configGet.mockImplementation((key: string) =>
        key === 'LOYALTY_POINTS_INACTIVITY_DAYS' ? 30 : undefined,
      );

      await service.expireStalePoints(now);

      expect(accountRepo.find).toHaveBeenCalledWith({
        where: {
          lastActivityAt: LessThan(new Date(now.getTime() - 30 * DAY_MS)),
        },
      });
    });

    it(`defaults to ${DEFAULT_INACTIVITY_EXPIRY_DAYS} days when unconfigured or invalid`, async () => {
      configGet.mockReturnValue('not-a-number');

      await service.expireStalePoints(now);

      expect(accountRepo.find).toHaveBeenCalledWith({
        where: {
          lastActivityAt: LessThan(
            new Date(now.getTime() - DEFAULT_INACTIVITY_EXPIRY_DAYS * DAY_MS),
          ),
        },
      });
    });

    it('zeroes stale balances, records an EXPIRE transaction and demotes', async () => {
      configGet.mockImplementation((key: string) =>
        key === 'LOYALTY_POINTS_INACTIVITY_DAYS' ? 30 : undefined,
      );
      const stale = makeAccount({
        userId: 'stale',
        pointsBalance: 2000,
        currentTier: 'Gold',
        lastActivityAt: new Date(now.getTime() - 31 * DAY_MS),
      });
      const recent = makeAccount({
        userId: 'recent',
        pointsBalance: 2000,
        currentTier: 'Gold',
        lastActivityAt: new Date(now.getTime() - 29 * DAY_MS),
      });
      accounts.set('stale', stale);
      accounts.set('recent', recent);
      staleAccountsQuery([stale, recent]);

      await service.expireStalePoints(now);

      expect(accounts.get('stale')).toMatchObject({
        pointsBalance: 0,
        currentTier: 'Bronze',
      });
      expect(accounts.get('recent')).toMatchObject({
        pointsBalance: 2000,
        currentTier: 'Gold',
      });
      expect(em.save).toHaveBeenCalledWith(
        LoyaltyTransaction,
        expect.objectContaining({
          userId: 'stale',
          type: LoyaltyTransactionType.EXPIRE,
          points: -2000,
          balanceAfter: 0,
          description: 'Points expired after 30 days of inactivity',
        }),
      );
      expect(notificationService.queueTierChangeEmail).toHaveBeenCalledWith({
        userId: 'stale',
        previousTier: 'Gold',
        newTier: 'Bronze',
      });
    });

    it('reports the expiry date using the configured period', async () => {
      configGet.mockImplementation((key: string) =>
        key === 'LOYALTY_POINTS_INACTIVITY_DAYS' ? 90 : undefined,
      );
      const lastActivityAt = new Date('2026-10-01T00:00:00Z');
      accounts.set('u1', makeAccount({ lastActivityAt }));

      const status = await service.getUserLoyaltyStatus('u1');

      expect(status.pointsExpiryDate).toEqual(
        new Date(lastActivityAt.getTime() + 90 * DAY_MS),
      );
    });
  });
});
