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

  // ── Private Helpers ────────────────────────────────────────────────────────

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
