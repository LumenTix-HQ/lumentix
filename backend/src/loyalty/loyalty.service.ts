import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LoyaltyAccount } from './entities/loyalty-account.entity';
import {
  LoyaltyTransaction,
  LoyaltyTransactionType,
} from './entities/loyalty-transaction.entity';
import {
  DiscountStatus,
  LoyaltyDiscount,
} from './entities/loyalty-discount.entity';
import { AwardPointsDto } from './dto/award-points.dto';
import { RedeemPointsDto } from './dto/redeem-points.dto';

/** Points awarded per confirmed event attendance */
export const POINTS_PER_ATTENDANCE = 100;

/** Minimum points required to redeem */
export const MIN_REDEEM_POINTS = 100;

/** Points-to-discount conversion: 100 pts = 1% discount, capped at 50% */
export const POINTS_PER_PERCENT = 100;
export const MAX_DISCOUNT_PERCENT = 50;

/** Discount code validity in days */
export const DISCOUNT_VALIDITY_DAYS = 90;

/** Inactivity expiry threshold in months */
export const INACTIVITY_EXPIRY_MONTHS = 12;

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    @InjectRepository(LoyaltyAccount)
    private readonly accountRepo: Repository<LoyaltyAccount>,
    @InjectRepository(LoyaltyTransaction)
    private readonly txRepo: Repository<LoyaltyTransaction>,
    @InjectRepository(LoyaltyDiscount)
    private readonly discountRepo: Repository<LoyaltyDiscount>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Award Loyalty Points ───────────────────────────────────────────────────

  /**
   * Award loyalty points to a user after a confirmed event attendance.
   * Creates the loyalty account if it doesn't exist yet.
   */
  async awardLoyaltyPoints(dto: AwardPointsDto): Promise<LoyaltyTransaction> {
    const { userId, points, eventId, description } = dto;

    return this.dataSource.transaction(async (em) => {
      // Upsert loyalty account
      let account = await em.findOne(LoyaltyAccount, { where: { userId } });
      if (!account) {
        account = em.create(LoyaltyAccount, {
          userId,
          pointsBalance: 0,
          totalPointsEarned: 0,
          totalPointsRedeemed: 0,
        });
      }

      account.pointsBalance += points;
      account.totalPointsEarned += points;
      account.lastActivityAt = new Date();
      await em.save(LoyaltyAccount, account);

      const tx = em.create(LoyaltyTransaction, {
        userId,
        type: LoyaltyTransactionType.EARN,
        points,
        balanceAfter: account.pointsBalance,
        description: description ?? `Earned ${points} points`,
        eventId: eventId ?? null,
        discountId: null,
      });

      const saved = await em.save(LoyaltyTransaction, tx);

      this.logger.log(
        `Awarded ${points} pts to user ${userId} (balance: ${account.pointsBalance})`,
      );

      return saved;
    });
  }

  // ── Redeem Points for Discount ─────────────────────────────────────────────

  /**
   * Redeem loyalty points for a discount code.
   * 100 points = 1% discount, capped at 50%.
   * Discount code is valid for 90 days.
   */
  async redeemPointsForDiscount(
    userId: string,
    dto: RedeemPointsDto,
  ): Promise<LoyaltyDiscount> {
    const { points } = dto;

    if (points < MIN_REDEEM_POINTS) {
      throw new BadRequestException(
        `Minimum redemption is ${MIN_REDEEM_POINTS} points`,
      );
    }

    return this.dataSource.transaction(async (em) => {
      const account = await em.findOne(LoyaltyAccount, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!account) {
        throw new NotFoundException('Loyalty account not found');
      }

      if (account.pointsBalance < points) {
        throw new BadRequestException(
          `Insufficient points. Balance: ${account.pointsBalance}, requested: ${points}`,
        );
      }

      // Calculate discount percentage
      const rawPercent = points / POINTS_PER_PERCENT;
      const discountPercent = Math.min(rawPercent, MAX_DISCOUNT_PERCENT);

      // Generate unique discount code
      const code = this.generateDiscountCode();

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + DISCOUNT_VALIDITY_DAYS);

      // Deduct points
      account.pointsBalance -= points;
      account.totalPointsRedeemed += points;
      account.lastActivityAt = new Date();
      await em.save(LoyaltyAccount, account);

      // Create discount record
      const discount = em.create(LoyaltyDiscount, {
        userId,
        code,
        discountPercent,
        pointsSpent: points,
        status: DiscountStatus.ACTIVE,
        expiresAt,
        usedOnEventId: null,
      });
      const savedDiscount = await em.save(LoyaltyDiscount, discount);

      // Record transaction
      const tx = em.create(LoyaltyTransaction, {
        userId,
        type: LoyaltyTransactionType.REDEEM,
        points: -points,
        balanceAfter: account.pointsBalance,
        description: `Redeemed ${points} pts for ${discountPercent}% discount (code: ${code})`,
        eventId: null,
        discountId: savedDiscount.id,
      });
      await em.save(LoyaltyTransaction, tx);

      this.logger.log(
        `User ${userId} redeemed ${points} pts for ${discountPercent}% discount (code: ${code})`,
      );

      return savedDiscount;
    });
  }

  // ── Get User Loyalty Status ────────────────────────────────────────────────

  /**
   * Returns the full loyalty status for a user including balance,
   * lifetime stats, active discounts, and recent transaction history.
   */
  async getUserLoyaltyStatus(userId: string) {
    const account = await this.accountRepo.findOne({ where: { userId } });

    if (!account) {
      return {
        userId,
        pointsBalance: 0,
        totalPointsEarned: 0,
        totalPointsRedeemed: 0,
        lastActivityAt: null,
        pointsExpiryDate: null,
        activeDiscounts: [],
        recentTransactions: [],
        tier: this.calculateTier(0),
      };
    }

    // Calculate expiry date (12 months from last activity)
    const pointsExpiryDate = account.lastActivityAt
      ? new Date(
          new Date(account.lastActivityAt).setMonth(
            new Date(account.lastActivityAt).getMonth() + INACTIVITY_EXPIRY_MONTHS,
          ),
        )
      : null;

    const [activeDiscounts, recentTransactions] = await Promise.all([
      this.discountRepo.find({
        where: { userId, status: DiscountStatus.ACTIVE },
        order: { createdAt: 'DESC' },
      }),
      this.txRepo.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: 20,
      }),
    ]);

    return {
      userId,
      pointsBalance: account.pointsBalance,
      totalPointsEarned: account.totalPointsEarned,
      totalPointsRedeemed: account.totalPointsRedeemed,
      lastActivityAt: account.lastActivityAt,
      pointsExpiryDate,
      activeDiscounts,
      recentTransactions,
      tier: this.calculateTier(account.totalPointsEarned),
    };
  }

  // ── Apply Discount Code ────────────────────────────────────────────────────

  /**
   * Validates and applies a discount code to an event purchase.
   * Returns the discount percentage if valid.
   */
  async applyDiscountCode(
    code: string,
    userId: string,
    eventId: string,
  ): Promise<{ discountPercent: number; discountId: string }> {
    const discount = await this.discountRepo.findOne({ where: { code } });

    if (!discount) {
      throw new NotFoundException('Discount code not found');
    }

    if (discount.userId !== userId) {
      throw new BadRequestException('This discount code does not belong to you');
    }

    if (discount.status !== DiscountStatus.ACTIVE) {
      throw new BadRequestException(
        `Discount code is ${discount.status} and cannot be applied`,
      );
    }

    if (new Date() > discount.expiresAt) {
      discount.status = DiscountStatus.EXPIRED;
      await this.discountRepo.save(discount);
      throw new BadRequestException('Discount code has expired');
    }

    discount.status = DiscountStatus.USED;
    discount.usedOnEventId = eventId;
    await this.discountRepo.save(discount);

    return {
      discountPercent: Number(discount.discountPercent),
      discountId: discount.id,
    };
  }

  // ── Scheduled: Expire Points After 12 Months of Inactivity ────────────────

  /**
   * Runs daily at 02:00 UTC.
   * Expires all points for accounts with no activity in the last 12 months.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async expireInactivePoints(): Promise<void> {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - INACTIVITY_EXPIRY_MONTHS);

    const staleAccounts = await this.accountRepo.find({
      where: {
        lastActivityAt: LessThan(cutoff),
      },
    });

    // Also expire accounts that were created before the cutoff and never had activity
    const neverActiveAccounts = await this.accountRepo
      .createQueryBuilder('la')
      .where('la.lastActivityAt IS NULL')
      .andWhere('la.createdAt < :cutoff', { cutoff })
      .andWhere('la.pointsBalance > 0')
      .getMany();

    const toExpire = [
      ...staleAccounts.filter((a) => a.pointsBalance > 0),
      ...neverActiveAccounts,
    ];

    if (toExpire.length === 0) return;

    this.logger.log(`Expiring points for ${toExpire.length} inactive accounts`);

    for (const account of toExpire) {
      await this.dataSource.transaction(async (em) => {
        const expiredPoints = account.pointsBalance;
        account.pointsBalance = 0;
        await em.save(LoyaltyAccount, account);

        const tx = em.create(LoyaltyTransaction, {
          userId: account.userId,
          type: LoyaltyTransactionType.EXPIRE,
          points: -expiredPoints,
          balanceAfter: 0,
          description: `Points expired due to ${INACTIVITY_EXPIRY_MONTHS} months of inactivity`,
          eventId: null,
          discountId: null,
        });
        await em.save(LoyaltyTransaction, tx);
      });
    }

    this.logger.log(`Points expiry job completed for ${toExpire.length} accounts`);
  }

  // ── Award Points on Event Attendance (internal helper) ────────────────────

  /**
   * Convenience method called by RegistrationsService when a registration
   * is confirmed. Awards POINTS_PER_ATTENDANCE points.
   */
  async awardAttendancePoints(
    userId: string,
    eventId: string,
    eventTitle: string,
  ): Promise<void> {
    try {
      await this.awardLoyaltyPoints({
        userId,
        points: POINTS_PER_ATTENDANCE,
        eventId,
        description: `Attended event: ${eventTitle}`,
      });
    } catch (err) {
      // Non-critical — log and continue
      this.logger.warn(
        `Failed to award attendance points for user ${userId}, event ${eventId}: ${(err as Error).message}`,
      );
    }
  }

  // ── Calculate Loyalty Points ────────────────────────────────────────────────

  /**
   * Calculate loyalty points for a user based on their full purchase and
   * attendance history. Factors considered:
   * - Confirmed event registrations (+100 pts each)
   * - Ticket purchases (+50 pts each)
   * - Bonus for consecutive attendance streak (+10% bonus)
   * - Early bird bonus for first 5 events (+25 pts each)
   */
  async calculateLoyaltyPoints(userId: string): Promise<{
    basePoints: number;
    streakBonus: number;
    earlyBirdBonus: number;
    totalPoints: number;
    tier: { name: string; minPoints: number; nextTier: string | null; pointsToNextTier: number | null };
  }> {
    const account = await this.accountRepo.findOne({ where: { userId } });

    if (!account) {
      return {
        basePoints: 0,
        streakBonus: 0,
        earlyBirdBonus: 0,
        totalPoints: 0,
        tier: this.calculateTier(0),
      };
    }

    const transactions = await this.txRepo.find({
      where: { userId, type: LoyaltyTransactionType.EARN },
      order: { createdAt: 'ASC' },
    });

    const basePoints = transactions
      .filter((tx) => !tx.description?.includes('streak') && !tx.description?.includes('early'))
      .reduce((sum, tx) => sum + tx.points, 0);

    const uniqueEvents = new Set(
      transactions.filter((tx) => tx.eventId).map((tx) => tx.eventId),
    );

    const streakBonus = Math.floor(uniqueEvents.size / 3) * 10;
    const earlyBirdBonus = Math.min(uniqueEvents.size, 5) * 25;

    const totalPoints = basePoints + streakBonus + earlyBirdBonus;

    return {
      basePoints,
      streakBonus,
      earlyBirdBonus,
      totalPoints,
      tier: this.calculateTier(totalPoints),
    };
  }

  // ── Upgrade Loyalty Tier ───────────────────────────────────────────────────

  /**
   * Automatically upgrade a user's loyalty tier based on their total earned points.
   * Tier thresholds: Bronze (0), Silver (500), Gold (1500), Platinum (5000).
   * Returns the new tier and any applicable tier-upgrade discount.
   */
  async upgradeLoyaltyTier(
    userId: string,
  ): Promise<{
    previousTier: string;
    newTier: string;
    upgraded: boolean;
    tierUpgradeDiscount: number | null;
  }> {
    const account = await this.accountRepo.findOne({ where: { userId } });

    if (!account) {
      return {
        previousTier: 'None',
        newTier: 'Bronze',
        upgraded: true,
        tierUpgradeDiscount: null,
      };
    }

    const previousTier = this.calculateTier(
      account.totalPointsEarned - account.totalPointsRedeemed,
    ).name;
    const newTierCalc = this.calculateTier(account.totalPointsEarned);
    const upgraded = newTierCalc.name !== previousTier;

    const tierUpgradeDiscount: number | null = upgraded
      ? this.getTierUpgradeDiscountPercent(newTierCalc.name)
      : null;

    if (upgraded && tierUpgradeDiscount) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + DISCOUNT_VALIDITY_DAYS);

      const code = `TIERUP-${this.generateShortCode()}`;
      const discount = this.discountRepo.create({
        userId,
        code,
        discountPercent: tierUpgradeDiscount,
        pointsSpent: 0,
        status: DiscountStatus.ACTIVE,
        expiresAt,
        usedOnEventId: null,
      });
      await this.discountRepo.save(discount);

      this.logger.log(
        `User ${userId} upgraded from ${previousTier} to ${newTierCalc.name}. ` +
          `Tier upgrade discount: ${tierUpgradeDiscount}% (code: ${code})`,
      );
    }

    return {
      previousTier,
      newTier: newTierCalc.name,
      upgraded,
      tierUpgradeDiscount,
    };
  }

  // ── Apply Tier Discounts ───────────────────────────────────────────────────

  /**
   * Apply automatic tier-based discounts to an event purchase.
   * Discount percentages by tier: Bronze (0%), Silver (2%), Gold (5%), Platinum (10%).
   */
  async applyTierDiscounts(
    userId: string,
    eventId: string,
  ): Promise<{
    tier: string;
    discountPercent: number;
    discountApplied: boolean;
  }> {
    const account = await this.accountRepo.findOne({ where: { userId } });

    if (!account) {
      return {
        tier: 'None',
        discountPercent: 0,
        discountApplied: false,
      };
    }

    const tierInfo = this.calculateTier(account.totalPointsEarned);
    const discountPercent = this.getTierAutoDiscountPercent(tierInfo.name);

    return {
      tier: tierInfo.name,
      discountPercent,
      discountApplied: discountPercent > 0,
    };
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private getTierUpgradeDiscountPercent(tier: string): number {
    switch (tier) {
      case 'Silver':
        return 5;
      case 'Gold':
        return 10;
      case 'Platinum':
        return 15;
      default:
        return 0;
    }
  }

  private getTierAutoDiscountPercent(tier: string): number {
    switch (tier) {
      case 'Silver':
        return 2;
      case 'Gold':
        return 5;
      case 'Platinum':
        return 10;
      default:
        return 0;
    }
  }

  private generateShortCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 8 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length)),
    ).join('');
  }

  private generateDiscountCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segment = (len: number) =>
      Array.from({ length: len }, () =>
        chars.charAt(Math.floor(Math.random() * chars.length)),
      ).join('');
    return `LOYALTY-${segment(4)}-${segment(4)}`;
  }

  private calculateTier(totalEarned: number): {
    name: string;
    minPoints: number;
    nextTier: string | null;
    pointsToNextTier: number | null;
  } {
    const tiers = [
      { name: 'Bronze', minPoints: 0 },
      { name: 'Silver', minPoints: 500 },
      { name: 'Gold', minPoints: 1500 },
      { name: 'Platinum', minPoints: 5000 },
    ];

    let currentTier = tiers[0];
    for (const tier of tiers) {
      if (totalEarned >= tier.minPoints) {
        currentTier = tier;
      }
    }

    const currentIndex = tiers.indexOf(currentTier);
    const nextTier = tiers[currentIndex + 1] ?? null;

    return {
      name: currentTier.name,
      minPoints: currentTier.minPoints,
      nextTier: nextTier?.name ?? null,
      pointsToNextTier: nextTier ? nextTier.minPoints - totalEarned : null,
    };
  }
}
