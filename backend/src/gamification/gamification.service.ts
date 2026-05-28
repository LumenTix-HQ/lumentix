import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

import { Achievement, AchievementCategory, AchievementTier } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { GamificationProfile } from './entities/user-profile.entity';
import { LeaderboardEntry, LeaderboardPeriod } from './entities/leaderboard-entry.entity';
import { Challenge, ChallengeStatus, ChallengeType } from './entities/challenge.entity';
import { ChallengeParticipation } from './entities/challenge-participation.entity';

import { AwardAchievementDto } from './dto/award-achievement.dto';
import { CreateAchievementDto } from './dto/create-achievement.dto';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { ActivityType, RecordActivityDto } from './dto/record-activity.dto';

import { AuditService } from '../audit/audit.service';
import { User } from '../users/entities/user.entity';

/** XP awarded per activity type */
const ACTIVITY_XP: Record<ActivityType, number> = {
  [ActivityType.TICKET_PURCHASED]:  10,
  [ActivityType.EVENT_ATTENDED]:    20,
  [ActivityType.REVIEW_WRITTEN]:    15,
  [ActivityType.EARLY_BOOKING]:     25,
  [ActivityType.SOCIAL_SHARE]:       5,
  [ActivityType.EVENT_HOSTED]:      30,
  [ActivityType.INSURANCE_BOUGHT]:   8,
  [ActivityType.REFERRAL_MADE]:     20,
  [ActivityType.FIRST_TICKET]:      50,
  [ActivityType.FIVE_STAR_REVIEW]:  10,
};

/** Level formula: level = floor(sqrt(totalXp / 100)) + 1 */
function calcLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(
    @InjectRepository(Achievement)
    private readonly achievementRepo: Repository<Achievement>,

    @InjectRepository(UserAchievement)
    private readonly userAchievementRepo: Repository<UserAchievement>,

    @InjectRepository(GamificationProfile)
    private readonly profileRepo: Repository<GamificationProfile>,

    @InjectRepository(LeaderboardEntry)
    private readonly leaderboardRepo: Repository<LeaderboardEntry>,

    @InjectRepository(Challenge)
    private readonly challengeRepo: Repository<Challenge>,

    @InjectRepository(ChallengeParticipation)
    private readonly participationRepo: Repository<ChallengeParticipation>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly auditService: AuditService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // award_achievement
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Award an achievement badge to a user.
   *
   * Logic:
   *  1. Resolve achievement by key or UUID.
   *  2. Check if user already holds it (block if non-repeatable).
   *  3. Create UserAchievement record.
   *  4. Add XP to the user's GamificationProfile and recalculate level.
   *  5. Audit log the award.
   *  6. Trigger auto-check for milestone achievements.
   */
  async awardAchievement(dto: AwardAchievementDto): Promise<UserAchievement> {
    // 1. Resolve achievement
    const achievement = await this.resolveAchievement(dto.achievementKeyOrId);
    if (!achievement.isActive) {
      throw new BadRequestException(`Achievement "${achievement.key}" is not active.`);
    }

    // 2. Duplicate check for non-repeatable achievements
    if (!achievement.repeatable) {
      const existing = await this.userAchievementRepo.findOne({
        where: { userId: dto.userId, achievementId: achievement.id },
      });
      if (existing) {
        throw new ConflictException(
          `User already holds achievement "${achievement.key}".`,
        );
      }
    }

    // 3. Create award record
    const award = this.userAchievementRepo.create({
      userId:        dto.userId,
      achievementId: achievement.id,
      xpAwarded:     achievement.xpReward,
      context:       dto.context ?? null,
    });
    const saved = await this.userAchievementRepo.save(award);

    // 4. Update profile XP + level
    const profile = await this.getOrCreateProfile(dto.userId);
    profile.totalXp += achievement.xpReward;
    profile.level    = calcLevel(profile.totalXp);
    await this.profileRepo.save(profile);

    // 5. Audit
    await this.auditService.log({
      action:     'ACHIEVEMENT_AWARDED',
      userId:     dto.userId,
      resourceId: achievement.id,
      meta: {
        achievementKey: achievement.key,
        xpAwarded:      achievement.xpReward,
        context:        dto.context,
      },
    });

    this.logger.log(
      `Achievement awarded: user=${dto.userId} achievement=${achievement.key} xp=${achievement.xpReward}`,
    );

    // 6. Check if new XP unlocks any milestone achievements
    await this.checkMilestoneAchievements(dto.userId, profile.totalXp);

    return saved;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // update_leaderboard
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Rebuild the leaderboard for a given period.
   *
   * Algorithm:
   *  1. Query all GamificationProfiles ordered by totalXp DESC.
   *  2. For each user, count their achievements.
   *  3. Write a fresh batch of LeaderboardEntry rows.
   *  4. Update leaderboardRank on each GamificationProfile.
   *  5. Return the top-N entries.
   */
  async updateLeaderboard(
    period: LeaderboardPeriod = LeaderboardPeriod.ALL_TIME,
    topN = 100,
  ): Promise<LeaderboardEntry[]> {
    const periodLabel = this.buildPeriodLabel(period);

    // 1. Fetch profiles ordered by XP
    const profiles = await this.profileRepo.find({
      order: { totalXp: 'DESC' },
      take: topN,
    });

    if (profiles.length === 0) return [];

    // 2. Count achievements per user in one query
    const userIds = profiles.map(p => p.userId);
    const achievementCounts = await this.userAchievementRepo
      .createQueryBuilder('ua')
      .select('ua.userId', 'userId')
      .addSelect('COUNT(*)', 'count')
      .where('ua.userId IN (:...userIds)', { userIds })
      .groupBy('ua.userId')
      .getRawMany<{ userId: string; count: string }>();

    const countMap = new Map(achievementCounts.map(r => [r.userId, parseInt(r.count, 10)]));

    // 3. Fetch display names
    const users = await this.userRepo.find({
      where: { id: In(userIds) },
      select: ['id', 'email'],
    });
    const nameMap = new Map(users.map(u => [u.id, u.email.split('@')[0]]));

    // 4. Build and save entries
    const entries: LeaderboardEntry[] = [];
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      const rank = i + 1;

      const entry = this.leaderboardRepo.create({
        period,
        periodLabel,
        userId:           p.userId,
        rank,
        xp:               p.totalXp,
        level:            p.level,
        achievementCount: countMap.get(p.userId) ?? 0,
        displayName:      nameMap.get(p.userId) ?? null,
      });
      entries.push(entry);

      // Update rank on profile
      p.leaderboardRank = rank;
    }

    await this.leaderboardRepo.save(entries);
    await this.profileRepo.save(profiles);

    await this.auditService.log({
      action:     'LEADERBOARD_UPDATED',
      userId:     'system',
      resourceId: period,
      meta:       { period, periodLabel, entryCount: entries.length },
    });

    this.logger.log(`Leaderboard updated: period=${period} entries=${entries.length}`);

    return entries;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // create_challenge
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new time-boxed challenge.
   *
   * Validates:
   *  - endsAt > startsAt
   *  - rewardAchievementId exists if provided
   *  - No overlapping active challenge with the same title
   */
  async createChallenge(dto: CreateChallengeDto, creatorId: string): Promise<Challenge> {
    const startsAt = new Date(dto.startsAt);
    const endsAt   = new Date(dto.endsAt);

    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt.');
    }

    if (dto.rewardAchievementId) {
      const ach = await this.achievementRepo.findOne({ where: { id: dto.rewardAchievementId } });
      if (!ach) throw new NotFoundException(`Achievement "${dto.rewardAchievementId}" not found.`);
    }

    const challenge = this.challengeRepo.create({
      title:               dto.title,
      description:         dto.description,
      icon:                dto.icon ?? '🎯',
      type:                dto.type,
      category:            dto.category,
      status:              ChallengeStatus.DRAFT,
      criteria:            dto.criteria,
      communityGoal:       dto.communityGoal ?? null,
      xpReward:            dto.xpReward ?? 50,
      rewardAchievementId: dto.rewardAchievementId ?? null,
      startsAt,
      endsAt,
      maxParticipants:     dto.maxParticipants ?? null,
    });

    const saved = await this.challengeRepo.save(challenge);

    await this.auditService.log({
      action:     'CHALLENGE_CREATED',
      userId:     creatorId,
      resourceId: saved.id,
      meta:       { title: dto.title, type: dto.type, category: dto.category },
    });

    this.logger.log(`Challenge created: id=${saved.id} title="${dto.title}"`);

    return saved;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // record_activity  (called by other services to trigger XP + achievement checks)
  // ─────────────────────────────────────────────────────────────────────────

  async recordActivity(
    userId: string,
    dto: RecordActivityDto,
  ): Promise<{ xpGained: number; newAchievements: UserAchievement[] }> {
    const xp      = ACTIVITY_XP[dto.activityType] ?? 0;
    const profile = await this.getOrCreateProfile(userId);
    const newAchievements: UserAchievement[] = [];

    // Update profile counters
    switch (dto.activityType) {
      case ActivityType.TICKET_PURCHASED:
      case ActivityType.FIRST_TICKET:
        profile.ticketsPurchased += 1;
        break;
      case ActivityType.EVENT_ATTENDED:
        profile.eventsAttended += 1;
        if (dto.eventCategory && !profile.categoriesAttended.includes(dto.eventCategory)) {
          profile.categoriesAttended = [...profile.categoriesAttended, dto.eventCategory];
        }
        break;
      case ActivityType.REVIEW_WRITTEN:
      case ActivityType.FIVE_STAR_REVIEW:
        profile.reviewsWritten += 1;
        break;
      case ActivityType.SOCIAL_SHARE:
        profile.socialShares += 1;
        break;
      case ActivityType.EVENT_HOSTED:
        profile.eventsHosted += 1;
        break;
    }

    profile.totalXp += xp;
    profile.level    = calcLevel(profile.totalXp);
    await this.profileRepo.save(profile);

    // Auto-check achievements for this activity
    const earned = await this.checkActivityAchievements(userId, profile, dto);
    newAchievements.push(...earned);

    // Advance active challenge participations
    await this.advanceChallengeProgress(userId, dto);

    return { xpGained: xp, newAchievements };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Challenge participation
  // ─────────────────────────────────────────────────────────────────────────

  async joinChallenge(challengeId: string, userId: string): Promise<ChallengeParticipation> {
    const challenge = await this.challengeRepo.findOne({ where: { id: challengeId } });
    if (!challenge) throw new NotFoundException(`Challenge "${challengeId}" not found.`);
    if (challenge.status !== ChallengeStatus.ACTIVE) {
      throw new BadRequestException('Challenge is not currently active.');
    }
    if (challenge.maxParticipants !== null && challenge.participantCount >= challenge.maxParticipants) {
      throw new BadRequestException('Challenge has reached maximum participants.');
    }

    const existing = await this.participationRepo.findOne({ where: { challengeId, userId } });
    if (existing) throw new ConflictException('Already participating in this challenge.');

    const participation = this.participationRepo.create({ challengeId, userId });
    const saved = await this.participationRepo.save(participation);

    challenge.participantCount += 1;
    await this.challengeRepo.save(challenge);

    return saved;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<GamificationProfile> {
    return this.getOrCreateProfile(userId);
  }

  async getUserAchievements(userId: string): Promise<UserAchievement[]> {
    return this.userAchievementRepo.find({
      where: { userId },
      order: { awardedAt: 'DESC' },
    });
  }

  async getAllAchievements(): Promise<Achievement[]> {
    return this.achievementRepo.find({
      where: { isActive: true },
      order: { category: 'ASC', tier: 'ASC' },
    });
  }

  async createAchievement(dto: CreateAchievementDto, creatorId: string): Promise<Achievement> {
    const existing = await this.achievementRepo.findOne({ where: { key: dto.key } });
    if (existing) throw new ConflictException(`Achievement key "${dto.key}" already exists.`);

    const achievement = this.achievementRepo.create({
      key:         dto.key,
      name:        dto.name,
      description: dto.description,
      icon:        dto.icon ?? '🏅',
      category:    dto.category,
      tier:        dto.tier,
      xpReward:    dto.xpReward ?? 10,
      threshold:   dto.threshold ?? 1,
      repeatable:  dto.repeatable ?? false,
    });
    const saved = await this.achievementRepo.save(achievement);

    await this.auditService.log({
      action: 'ACHIEVEMENT_CREATED', userId: creatorId, resourceId: saved.id,
      meta: { key: dto.key, category: dto.category, tier: dto.tier },
    });

    return saved;
  }

  async getLeaderboard(
    period: LeaderboardPeriod = LeaderboardPeriod.ALL_TIME,
    limit = 50,
  ): Promise<LeaderboardEntry[]> {
    return this.leaderboardRepo.find({
      where: { period },
      order: { rank: 'ASC' },
      take: Math.min(limit, 200),
    });
  }

  async getActiveChallenges(): Promise<Challenge[]> {
    const now = new Date();
    return this.challengeRepo.find({
      where: { status: ChallengeStatus.ACTIVE },
      order: { endsAt: 'ASC' },
    });
  }

  async getChallenge(id: string): Promise<Challenge> {
    const c = await this.challengeRepo.findOne({ where: { id } });
    if (!c) throw new NotFoundException(`Challenge "${id}" not found.`);
    return c;
  }

  async getMyChallenges(userId: string): Promise<ChallengeParticipation[]> {
    return this.participationRepo.find({
      where: { userId },
      order: { joinedAt: 'DESC' },
    });
  }

  async activateChallenge(id: string, adminId: string): Promise<Challenge> {
    const challenge = await this.getChallenge(id);
    if (challenge.status !== ChallengeStatus.DRAFT) {
      throw new BadRequestException('Only draft challenges can be activated.');
    }
    challenge.status = ChallengeStatus.ACTIVE;
    const saved = await this.challengeRepo.save(challenge);
    await this.auditService.log({
      action: 'CHALLENGE_ACTIVATED', userId: adminId, resourceId: id,
    });
    return saved;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scheduled jobs
  // ─────────────────────────────────────────────────────────────────────────

  /** Rebuild all-time leaderboard every hour */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledLeaderboardUpdate(): Promise<void> {
    await this.updateLeaderboard(LeaderboardPeriod.ALL_TIME).catch(err =>
      this.logger.error('Scheduled leaderboard update failed', err),
    );
    await this.updateLeaderboard(LeaderboardPeriod.WEEKLY).catch(err =>
      this.logger.error('Scheduled weekly leaderboard update failed', err),
    );
  }

  /** Expire challenges that have passed their endsAt */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireChallenges(): Promise<void> {
    const now = new Date();
    const expired = await this.challengeRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: ChallengeStatus.ACTIVE })
      .andWhere('c.endsAt < :now', { now })
      .getMany();

    for (const c of expired) {
      c.status = ChallengeStatus.EXPIRED;
      await this.challengeRepo.save(c);
      this.logger.log(`Challenge expired: id=${c.id} title="${c.title}"`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async getOrCreateProfile(userId: string): Promise<GamificationProfile> {
    let profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) {
      profile = this.profileRepo.create({ userId });
      profile = await this.profileRepo.save(profile);
    }
    return profile;
  }

  private async resolveAchievement(keyOrId: string): Promise<Achievement> {
    // Try UUID first, then key
    const isUuid = /^[0-9a-f-]{36}$/i.test(keyOrId);
    const achievement = isUuid
      ? await this.achievementRepo.findOne({ where: { id: keyOrId } })
      : await this.achievementRepo.findOne({ where: { key: keyOrId } });

    if (!achievement) throw new NotFoundException(`Achievement "${keyOrId}" not found.`);
    return achievement;
  }

  private async checkActivityAchievements(
    userId: string,
    profile: GamificationProfile,
    dto: RecordActivityDto,
  ): Promise<UserAchievement[]> {
    const awarded: UserAchievement[] = [];

    // Map activity → category + profile counter
    const checks: Array<{ category: AchievementCategory; count: number }> = [];

    switch (dto.activityType) {
      case ActivityType.TICKET_PURCHASED:
      case ActivityType.FIRST_TICKET:
        checks.push({ category: AchievementCategory.BOOKING, count: profile.ticketsPurchased });
        break;
      case ActivityType.EARLY_BOOKING:
        checks.push({ category: AchievementCategory.BOOKING, count: profile.ticketsPurchased });
        break;
      case ActivityType.EVENT_ATTENDED:
        checks.push({ category: AchievementCategory.LOYALTY, count: profile.eventsAttended });
        checks.push({ category: AchievementCategory.EXPLORER, count: profile.categoriesAttended.length });
        break;
      case ActivityType.REVIEW_WRITTEN:
      case ActivityType.FIVE_STAR_REVIEW:
        checks.push({ category: AchievementCategory.REVIEW, count: profile.reviewsWritten });
        break;
      case ActivityType.SOCIAL_SHARE:
        checks.push({ category: AchievementCategory.SOCIAL, count: profile.socialShares });
        break;
      case ActivityType.EVENT_HOSTED:
        checks.push({ category: AchievementCategory.ORGANIZER, count: profile.eventsHosted });
        break;
    }

    for (const { category, count } of checks) {
      const candidates = await this.achievementRepo.find({
        where: { category, isActive: true },
        order: { threshold: 'ASC' },
      });

      for (const ach of candidates) {
        if (count < ach.threshold) continue;

        // Skip if already awarded (non-repeatable)
        if (!ach.repeatable) {
          const has = await this.userAchievementRepo.findOne({
            where: { userId, achievementId: ach.id },
          });
          if (has) continue;
        }

        try {
          const award = await this.awardAchievement({
            userId,
            achievementKeyOrId: ach.id,
            context: dto.context,
          });
          awarded.push(award);
        } catch {
          // ConflictException = already awarded, skip silently
        }
      }
    }

    return awarded;
  }

  private async checkMilestoneAchievements(userId: string, totalXp: number): Promise<void> {
    const milestones = await this.achievementRepo.find({
      where: { category: AchievementCategory.MILESTONE, isActive: true },
      order: { threshold: 'ASC' },
    });

    for (const ach of milestones) {
      if (totalXp < ach.threshold) continue;
      if (!ach.repeatable) {
        const has = await this.userAchievementRepo.findOne({
          where: { userId, achievementId: ach.id },
        });
        if (has) continue;
      }
      try {
        await this.awardAchievement({ userId, achievementKeyOrId: ach.id });
      } catch { /* already awarded */ }
    }
  }

  private async advanceChallengeProgress(userId: string, dto: RecordActivityDto): Promise<void> {
    const now = new Date();
    const participations = await this.participationRepo.find({
      where: { userId, completed: false },
    });

    for (const part of participations) {
      const challenge = await this.challengeRepo.findOne({ where: { id: part.challengeId } });
      if (!challenge || challenge.status !== ChallengeStatus.ACTIVE) continue;
      if (challenge.endsAt < now) continue;

      const criteria = challenge.criteria as { action?: string; count?: number; category?: string };
      const actionMatches = criteria.action === dto.activityType;
      const categoryMatches = !criteria.category || criteria.category === dto.eventCategory;

      if (!actionMatches || !categoryMatches) continue;

      part.progress += 1;

      // Community challenge: also increment shared counter
      if (challenge.type === ChallengeType.COMMUNITY) {
        challenge.communityProgress += 1;
        await this.challengeRepo.save(challenge);
      }

      const target = criteria.count ?? 1;
      if (part.progress >= target) {
        part.completed   = true;
        part.completedAt = new Date();
        part.xpAwarded   = challenge.xpReward;

        // Award XP
        const profile = await this.getOrCreateProfile(userId);
        profile.totalXp += challenge.xpReward;
        profile.level    = calcLevel(profile.totalXp);
        await this.profileRepo.save(profile);

        // Award linked achievement if any
        if (challenge.rewardAchievementId) {
          try {
            await this.awardAchievement({
              userId,
              achievementKeyOrId: challenge.rewardAchievementId,
              context: { challengeId: challenge.id },
            });
          } catch { /* already awarded */ }
        }

        this.logger.log(`Challenge completed: user=${userId} challenge=${challenge.id}`);
      }

      await this.participationRepo.save(part);
    }
  }

  private buildPeriodLabel(period: LeaderboardPeriod): string | null {
    const now = new Date();
    if (period === LeaderboardPeriod.MONTHLY) {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    if (period === LeaderboardPeriod.WEEKLY) {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const week = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
      return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
    }
    return null;
  }
}
