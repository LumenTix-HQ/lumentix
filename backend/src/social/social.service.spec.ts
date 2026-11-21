import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialService } from './social.service';
import { SocialProfile } from './entities/social-profile.entity';
import { AttendeeConnection } from './entities/attendee-connection.entity';
import { MeetupGroup } from './entities/meetup-group.entity';
import { MeetupMember } from './entities/meetup-member.entity';
import { Referral, ReferralStatus, RewardType } from './entities/referral.entity';
import { LoyaltyService } from '../loyalty/loyalty.service';

describe('SocialService — Referral Incentive Program (#1536)', () => {
  let service: SocialService;
  let referrals: Map<string, Referral>;
  let referralRepo: any;
  let loyaltyService: { awardLoyaltyPoints: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    referrals = new Map();

    referralRepo = {
      create: jest.fn((dto) => ({
        id: `ref-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...dto,
      })),
      save: jest.fn(async (entity) => {
        referrals.set(entity.id || entity.code, { ...entity });
        return { ...entity };
      }),
      findOne: jest.fn(async ({ where }) => {
        if (where.id) return referrals.get(where.id) || null;
        if (where.code) {
          for (const r of referrals.values()) {
            if (r.code === where.code) return { ...r };
          }
        }
        return null;
      }),
      find: jest.fn(async ({ where }) => {
        const results: Referral[] = [];
        for (const r of referrals.values()) {
          if (!where.referrerId || r.referrerId === where.referrerId) {
            results.push({ ...r });
          }
        }
        return results;
      }),
    };

    loyaltyService = {
      awardLoyaltyPoints: jest.fn().mockResolvedValue({ id: 'tx-123', points: 100 }),
    };

    configService = {
      get: jest.fn().mockReturnValue('https://lumentix.com'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialService,
        {
          provide: getRepositoryToken(SocialProfile),
          useValue: { findOne: jest.fn(), save: jest.fn(), create: jest.fn() },
        },
        {
          provide: getRepositoryToken(AttendeeConnection),
          useValue: { findOne: jest.fn(), save: jest.fn(), create: jest.fn() },
        },
        {
          provide: getRepositoryToken(MeetupGroup),
          useValue: { findOne: jest.fn(), save: jest.fn(), create: jest.fn() },
        },
        {
          provide: getRepositoryToken(MeetupMember),
          useValue: { findOne: jest.fn(), save: jest.fn(), create: jest.fn(), count: jest.fn() },
        },
        {
          provide: getRepositoryToken(Referral),
          useValue: referralRepo,
        },
        {
          provide: LoyaltyService,
          useValue: loyaltyService,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<SocialService>(SocialService);
  });

  describe('generate_referral_link', () => {
    it('generates a unique referral link and stores it as PENDING', async () => {
      const userId = 'user-referrer-1';
      const referral = await service.generate_referral_link(userId, {
        eventId: 'event-fest-2026',
        rewardType: RewardType.LOYALTY_POINTS,
      });

      expect(referral).toBeDefined();
      expect(referral.referrerId).toBe(userId);
      expect(referral.code).toMatch(/^REF-/);
      expect(referral.link).toContain(referral.code);
      expect(referral.link).toContain('event-fest-2026');
      expect(referral.status).toBe(ReferralStatus.PENDING);
      expect(referral.rewardIssued).toBe(false);
      expect(referral.rewardValue).toBe(100);
      expect(referralRepo.save).toHaveBeenCalled();
    });

    it('supports discount code reward type configuration', async () => {
      const referral = await service.generate_referral_link('user-2', {
        rewardType: RewardType.DISCOUNT_CODE,
      });

      expect(referral.rewardType).toBe(RewardType.DISCOUNT_CODE);
      expect(referral.rewardValue).toBe(10); // 10% discount
    });

    it('rejects empty user ID', async () => {
      await expect(service.generate_referral_link('')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('track_referral_conversion', () => {
    it('converts referral when friend purchases a ticket and triggers reward', async () => {
      const referrerId = 'user-referrer-1';
      const refereeId = 'user-friend-2';
      const generated = await service.generate_referral_link(referrerId, {
        rewardType: RewardType.LOYALTY_POINTS,
      });

      const converted = await service.track_referral_conversion(refereeId, {
        referralCode: generated.code,
        ticketId: 'ticket-999',
        eventId: 'event-fest-2026',
      });

      expect(converted.status).toBe(ReferralStatus.CONVERTED);
      expect(converted.refereeId).toBe(refereeId);
      expect(converted.ticketId).toBe('ticket-999');
      expect(converted.convertedAt).toBeDefined();
      expect(loyaltyService.awardLoyaltyPoints).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: referrerId,
          points: 100,
        }),
      );
    });

    it('prevents self-referral (referrer cannot be referee)', async () => {
      const userId = 'user-self';
      const generated = await service.generate_referral_link(userId);

      await expect(
        service.track_referral_conversion(userId, {
          referralCode: generated.code,
          ticketId: 'ticket-1',
        }),
      ).rejects.toThrow(/Self-referrals are not permitted/);
    });

    it('rejects invalid or non-existent referral codes', async () => {
      await expect(
        service.track_referral_conversion('friend-id', {
          referralCode: 'NON-EXISTENT',
          ticketId: 'ticket-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects already converted referral codes', async () => {
      const generated = await service.generate_referral_link('user-1');
      await service.track_referral_conversion('friend-1', {
        referralCode: generated.code,
        ticketId: 'ticket-1',
      });

      await expect(
        service.track_referral_conversion('friend-2', {
          referralCode: generated.code,
          ticketId: 'ticket-2',
        }),
      ).rejects.toThrow(/already been converted/);
    });

    it('rejects expired referral codes', async () => {
      const generated = await service.generate_referral_link('user-1');
      generated.expiresAt = new Date(Date.now() - 10000); // in the past
      referrals.set(generated.id, generated);

      await expect(
        service.track_referral_conversion('friend-1', {
          referralCode: generated.code,
          ticketId: 'ticket-1',
        }),
      ).rejects.toThrow(/expired/);
    });
  });

  describe('issue_referral_reward', () => {
    it('issues discount code when referral rewardType is DISCOUNT_CODE', async () => {
      const generated = await service.generate_referral_link('user-discount', {
        rewardType: RewardType.DISCOUNT_CODE,
      });

      generated.status = ReferralStatus.CONVERTED;
      generated.refereeId = 'friend-id';
      generated.ticketId = 'ticket-id';
      referrals.set(generated.id, generated);

      const result = await service.issue_referral_reward(generated.id);
      expect(result.referral.rewardIssued).toBe(true);
      expect(result.rewardDetails.type).toBe(RewardType.DISCOUNT_CODE);
      expect(result.rewardDetails.discountCode).toMatch(/^REF-/);
    });

    it('returns existing reward details if already issued (idempotent)', async () => {
      const generated = await service.generate_referral_link('user-id');
      generated.status = ReferralStatus.CONVERTED;
      generated.rewardIssued = true;
      generated.rewardValue = 100;
      referrals.set(generated.id, generated);

      const res = await service.issue_referral_reward(generated.id);
      expect(res.referral.rewardIssued).toBe(true);
      expect(res.rewardDetails.value).toBe(100);
    });

    it('rejects reward issuance for non-converted referrals', async () => {
      const generated = await service.generate_referral_link('user-id');
      await expect(service.issue_referral_reward(generated.id)).rejects.toThrow(
        /must be in CONVERTED status/,
      );
    });
  });

  describe('getReferralStats', () => {
    it('computes aggregated referral metrics correctly', async () => {
      const userId = 'stats-user';
      const r1 = await service.generate_referral_link(userId);
      const r2 = await service.generate_referral_link(userId);
      const r3 = await service.generate_referral_link(userId);

      // Convert r1 and r2
      await service.track_referral_conversion('friend-1', {
        referralCode: r1.code,
        ticketId: 't-1',
      });
      await service.track_referral_conversion('friend-2', {
        referralCode: r2.code,
        ticketId: 't-2',
      });

      const stats = await service.getReferralStats(userId);
      expect(stats.totalCreated).toBe(3);
      expect(stats.convertedCount).toBe(2);
      expect(stats.pendingCount).toBe(1);
      expect(stats.totalPointsEarned).toBe(200);
    });
  });
});
