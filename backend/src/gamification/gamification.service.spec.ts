import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { ChallengeStatus } from './entities/challenge.entity';

type Repo = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

const repo = (): Repo => ({
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  create: jest.fn((value) => ({ ...value })),
  save: jest.fn(async (value) => ({ id: 'saved-id', ...value })),
});

describe('GamificationService', () => {
  let achievementRepo: Repo;
  let userAchievementRepo: Repo;
  let profileRepo: Repo;
  let leaderboardRepo: Repo;
  let challengeRepo: Repo;
  let participationRepo: Repo;
  let userRepo: Repo;
  let badgeRepo: Repo;
  let userBadgeRepo: Repo;
  let audit: { log: jest.Mock };
  let service: GamificationService;

  beforeEach(() => {
    achievementRepo = repo();
    userAchievementRepo = repo();
    profileRepo = repo();
    leaderboardRepo = repo();
    challengeRepo = repo();
    participationRepo = repo();
    userRepo = repo();
    badgeRepo = repo();
    userBadgeRepo = repo();
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    service = new GamificationService(
      achievementRepo as never,
      userAchievementRepo as never,
      profileRepo as never,
      leaderboardRepo as never,
      challengeRepo as never,
      participationRepo as never,
      userRepo as never,
      badgeRepo as never,
      userBadgeRepo as never,
      audit as never,
    );
  });

  describe('awardAchievement', () => {
    const achievement = { id: 'a1', key: 'first_ticket', isActive: true, repeatable: false, xpReward: 50 };

    beforeEach(() => {
      achievementRepo.findOne.mockResolvedValue(achievement);
      achievementRepo.find.mockResolvedValue([]); // no milestone achievements
      profileRepo.findOne.mockResolvedValue({ userId: 'u1', totalXp: 0, level: 1 });
      userAchievementRepo.findOne.mockResolvedValue(null);
    });

    it('records the award, adds XP to the profile, recalculates the level and writes an audit entry', async () => {
      const result = await service.awardAchievement({
        userId: 'u1',
        achievementKeyOrId: 'first_ticket',
      } as never);

      expect(userAchievementRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', achievementId: 'a1', xpAwarded: 50 }),
      );
      expect(profileRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', totalXp: 50, level: 1 }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ACHIEVEMENT_AWARDED', userId: 'u1', resourceId: 'a1' }),
      );
      expect(result).toEqual(expect.objectContaining({ achievementId: 'a1' }));
    });

    it('rejects a duplicate award of a non-repeatable achievement', async () => {
      userAchievementRepo.findOne.mockResolvedValue({ id: 'ua1' });

      await expect(
        service.awardAchievement({ userId: 'u1', achievementKeyOrId: 'first_ticket' } as never),
      ).rejects.toThrow(ConflictException);
      expect(userAchievementRepo.save).not.toHaveBeenCalled();
    });

    it('rejects an inactive achievement', async () => {
      achievementRepo.findOne.mockResolvedValue({ ...achievement, isActive: false });

      await expect(
        service.awardAchievement({ userId: 'u1', achievementKeyOrId: 'first_ticket' } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown achievement', async () => {
      achievementRepo.findOne.mockResolvedValue(null);

      await expect(
        service.awardAchievement({ userId: 'u1', achievementKeyOrId: 'nope' } as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('joinChallenge', () => {
    const challenge = {
      id: 'c1',
      status: ChallengeStatus.ACTIVE,
      maxParticipants: null,
      participantCount: 0,
    };

    it('creates a participation and increments the participant count', async () => {
      challengeRepo.findOne.mockResolvedValue({ ...challenge });
      participationRepo.findOne.mockResolvedValue(null);

      await service.joinChallenge('c1', 'u1');

      expect(participationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ challengeId: 'c1', userId: 'u1' }),
      );
      expect(challengeRepo.save).toHaveBeenCalledWith(expect.objectContaining({ participantCount: 1 }));
    });

    it('rejects joining twice', async () => {
      challengeRepo.findOne.mockResolvedValue({ ...challenge });
      participationRepo.findOne.mockResolvedValue({ id: 'p1' });

      await expect(service.joinChallenge('c1', 'u1')).rejects.toThrow(ConflictException);
    });

    it('rejects a challenge that is not active', async () => {
      challengeRepo.findOne.mockResolvedValue({ ...challenge, status: ChallengeStatus.DRAFT });

      await expect(service.joinChallenge('c1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('rejects a full challenge', async () => {
      challengeRepo.findOne.mockResolvedValue({ ...challenge, maxParticipants: 2, participantCount: 2 });

      await expect(service.joinChallenge('c1', 'u1')).rejects.toThrow('maximum participants');
    });
  });

  describe('badge catalogue', () => {
    it('lists badges alphabetically and loads a user\'s earned badges newest first', async () => {
      badgeRepo.find.mockResolvedValue([{ id: 'b1' }]);
      userBadgeRepo.find.mockResolvedValue([{ id: 'ub1' }]);

      await expect(service.listBadges()).resolves.toEqual([{ id: 'b1' }]);
      await expect(service.getMyBadges('u1')).resolves.toEqual([{ id: 'ub1' }]);
      expect(badgeRepo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
      expect(userBadgeRepo.find).toHaveBeenCalledWith({ where: { userId: 'u1' }, order: { earnedAt: 'DESC' } });
    });

    it('throws NotFound for an unknown badge', async () => {
      badgeRepo.findOne.mockResolvedValue(null);

      await expect(service.getBadge('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
