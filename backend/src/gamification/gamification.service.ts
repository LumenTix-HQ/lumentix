import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Badge } from './entities/badge.entity';
import { UserBadge } from './entities/user-badge.entity';
import { LeaderboardEntry, LeaderboardPeriod } from './entities/leaderboard-entry.entity';

export interface UserProfile {
  userId: string;
  xp: number;
  badges: UserBadge[];
  rank: number | null;
}

export interface LeaderboardPage {
  period: LeaderboardPeriod;
  data: Array<{ rank: number; userId: string; displayName: string | null; xp: number }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(
    @InjectRepository(Badge)
    private readonly badgeRepo: Repository<Badge>,
    @InjectRepository(UserBadge)
    private readonly userBadgeRepo: Repository<UserBadge>,
    @InjectRepository(LeaderboardEntry)
    private readonly leaderboardRepo: Repository<LeaderboardEntry>,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // BADGES
  // ─────────────────────────────────────────────────────────────────────────

  /** Return all badge definitions. */
  async listBadges(): Promise<Badge[]> {
    return this.badgeRepo.find({ order: { name: 'ASC' } });
  }

  /** Return a single badge definition. */
  async getBadge(id: string): Promise<Badge> {
    const badge = await this.badgeRepo.findOne({ where: { id } });
    if (!badge) throw new NotFoundException(`Badge "${id}" not found.`);
    return badge;
  }

  /** Create a new badge definition (admin). */
  async createBadge(data: {
    key: string;
    name: string;
    description?: string;
    iconUrl?: string;
    xpReward?: number;
  }): Promise<Badge> {
    const badge = this.badgeRepo.create(data);
    return this.badgeRepo.save(badge);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // USER PROFILE
  // ─────────────────────────────────────────────────────────────────────────

  /** Return a user's XP, badges, and leaderboard rank (all-time). */
  async getUserProfile(userId: string): Promise<UserProfile> {
    const [entry, badges] = await Promise.all([
      this.leaderboardRepo.findOne({
        where: { userId, period: LeaderboardPeriod.ALL_TIME },
      }),
      this.userBadgeRepo.find({
        where: { userId },
        order: { earnedAt: 'DESC' },
      }),
    ]);

    const xp = entry?.xp ?? 0;

    // Compute rank: count how many users have strictly more XP
    let rank: number | null = null;
    if (entry) {
      const higherCount = await this.leaderboardRepo
        .createQueryBuilder('e')
        .where('e.period = :period', { period: LeaderboardPeriod.ALL_TIME })
        .andWhere('e.xp > :xp', { xp })
        .getCount();
      rank = higherCount + 1;
    }

    return { userId, xp, badges, rank };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // XP & BADGES (internal helpers — called by other modules or event hooks)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Award XP to a user. Upserts the leaderboard entry for all periods.
   * Idempotent for the same (userId, amount) pair — callers must ensure
   * this is only called once per distinct action.
   */
  async awardXp(
    userId: string,
    amount: number,
    displayName?: string,
  ): Promise<void> {
    if (amount <= 0) return;

    for (const period of Object.values(LeaderboardPeriod)) {
      const existing = await this.leaderboardRepo.findOne({
        where: { userId, period },
      });

      if (existing) {
        existing.xp += amount;
        if (displayName) existing.displayName = displayName;
        await this.leaderboardRepo.save(existing);
      } else {
        const entry = this.leaderboardRepo.create({
          userId,
          period,
          xp: amount,
          displayName: displayName ?? null,
        });
        await this.leaderboardRepo.save(entry);
      }
    }
  }

  /**
   * Award a badge to a user.
   * Silently no-ops if they already hold it (no duplicate conflict).
   */
  async awardBadge(userId: string, badgeKey: string): Promise<UserBadge | null> {
    const badge = await this.badgeRepo.findOne({ where: { key: badgeKey } });
    if (!badge) {
      this.logger.warn(`awardBadge: unknown badge key "${badgeKey}"`);
      return null;
    }

    const existing = await this.userBadgeRepo.findOne({
      where: { userId, badgeId: badge.id },
    });
    if (existing) return existing;

    const userBadge = this.userBadgeRepo.create({ userId, badgeId: badge.id });
    const saved = await this.userBadgeRepo.save(userBadge);

    // Grant XP reward for first-time badge earn
    if (badge.xpReward > 0) {
      await this.awardXp(userId, badge.xpReward);
    }

    this.logger.log(`Badge "${badgeKey}" awarded to user ${userId}`);
    return saved;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LEADERBOARD
  // ─────────────────────────────────────────────────────────────────────────

  async getLeaderboard(
    period: LeaderboardPeriod = LeaderboardPeriod.ALL_TIME,
    page = 1,
    limit = 20,
  ): Promise<LeaderboardPage> {
    const [rows, total] = await this.leaderboardRepo.findAndCount({
      where: { period },
      order: { xp: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const offset = (page - 1) * limit;
    const data = rows.map((row, i) => ({
      rank: offset + i + 1,
      userId: row.userId,
      displayName: row.displayName,
      xp: row.xp,
    }));

    return { period, data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Return current user's badges. */
  async getMyBadges(userId: string): Promise<UserBadge[]> {
    return this.userBadgeRepo.find({
      where: { userId },
      order: { earnedAt: 'DESC' },
    });
  }
}
