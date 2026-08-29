import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import {
  FlaggedTransaction,
  FraudFlagReason,
  FlagStatus,
} from './entities/flagged-transaction.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';

interface TradePattern {
  transactionHash: string;
  sellerId: string;
  buyerId: string;
  originalPrice: number;
  salePrice: number;
  timestamp: Date;
}

interface TradeMetrics {
  totalTrades: number;
  totalVolume: number;
  averagePrice: number;
  priceDeviation: number;
  velocityIndex: number;
}

@Injectable()
export class FraudDetectionService {
  constructor(
    @InjectRepository(FlaggedTransaction)
    private flaggedTransactionRepository: Repository<FlaggedTransaction>,
  ) {}

  /**
   * Analyze trade patterns for fraud indicators
   */
  async analyzeTradePatterns(
    eventId: string,
    trades: TradePattern[],
  ): Promise<{
    suspiciousTrades: string[];
    fraudIndicators: {
      washTradesDetected: number;
      botActivityDetected: number;
      suspiciousPricingDetected: number;
      riskScore: number;
    };
  }> {
    const suspiciousTrades: string[] = [];
    let washTradesCount = 0;
    let botActivityCount = 0;
    let suspiciousPricingCount = 0;
    let totalRiskScore = 0;

    for (const trade of trades) {
      let tradeRiskScore = 0;

      // Check for wash trading (same parties trading back and forth)
      const reverseTradeExists = trades.some(
        (t) =>
          t.sellerId === trade.buyerId &&
          t.buyerId === trade.sellerId &&
          Math.abs(
            t.timestamp.getTime() - trade.timestamp.getTime(),
          ) < 3600000, // 1 hour
      );

      if (reverseTradeExists) {
        washTradesCount++;
        tradeRiskScore += 0.3;
      }

      // Check for bot activity (rapid transactions from same account)
      const rapidTransactions = trades.filter(
        (t) =>
          (t.buyerId === trade.buyerId || t.sellerId === trade.sellerId) &&
          Math.abs(
            t.timestamp.getTime() - trade.timestamp.getTime(),
          ) < 300000, // 5 minutes
      ).length;

      if (rapidTransactions > 3) {
        botActivityCount++;
        tradeRiskScore += 0.25;
      }

      // Check for suspicious pricing
      const priceDeviation = Math.abs(
        (trade.salePrice - trade.originalPrice) / trade.originalPrice,
      );

      if (priceDeviation > 1.5) {
        // >150% markup
        suspiciousPricingCount++;
        tradeRiskScore += 0.35;
      } else if (priceDeviation > 1.0) {
        // >100% markup
        tradeRiskScore += 0.2;
      }

      if (tradeRiskScore >= 0.5) {
        suspiciousTrades.push(trade.transactionHash);
        totalRiskScore += tradeRiskScore;
      }
    }

    const avgRiskScore =
      trades.length > 0 ? totalRiskScore / trades.length : 0;

    return {
      suspiciousTrades,
      fraudIndicators: {
        washTradesDetected: washTradesCount,
        botActivityDetected: botActivityCount,
        suspiciousPricingDetected: suspiciousPricingCount,
        riskScore: Math.min(1, avgRiskScore),
      },
    };
  }

  /**
   * Flag a transaction as potentially fraudulent
   */
  async flagFraudulentTransaction(
    transactionHash: string,
    sellerId: string,
    buyerId: string,
    originalPrice: number,
    salePrice: number,
    eventId: string,
    flagReason: FraudFlagReason,
    riskScore: number,
    fraudIndicators?: Record<string, any>,
  ): Promise<FlaggedTransaction> {
    const existingFlag = await this.flaggedTransactionRepository.findOne({
      where: { transactionHash },
    });

    if (existingFlag) {
      // Update existing flag
      existingFlag.riskScore = Math.max(
        existingFlag.riskScore as any,
        riskScore,
      );
      if (fraudIndicators) {
        existingFlag.fraudIndicators = fraudIndicators;
      }
      return this.flaggedTransactionRepository.save(existingFlag);
    }

    const flaggedTransaction = this.flaggedTransactionRepository.create({
      transactionHash,
      sellerId,
      buyerId,
      originalPrice,
      salePrice,
      eventId,
      flagReason,
      riskScore,
      fraudIndicators,
      status: FlagStatus.PENDING,
    });

    return this.flaggedTransactionRepository.save(flaggedTransaction);
  }

  /**
   * Hold/suspend a suspicious trade from completing
   */
  async holdSuspiciousTrade(
    transactionHash: string,
    reason: string,
  ): Promise<void> {
    const flaggedTx = await this.flaggedTransactionRepository.findOne({
      where: { transactionHash },
    });

    if (!flaggedTx) {
      throw new NotFoundException('Transaction not found');
    }

    flaggedTx.status = FlagStatus.PENDING;
    if (!flaggedTx.actionTaken) {
      flaggedTx.actionTaken = {
        type: 'FUNDS_HELD',
        details: reason,
        timestamp: new Date().toISOString(),
      };
    }

    await this.flaggedTransactionRepository.save(flaggedTx);
  }

  /**
   * Get flagged transactions
   */
  async getFlaggedTransactions(
    status?: FlagStatus,
    skip = 0,
    take = 20,
  ): Promise<{
    data: FlaggedTransaction[];
    total: number;
  }> {
    const query = this.flaggedTransactionRepository.createQueryBuilder('ft');

    if (status) {
      query.where('ft.status = :status', { status });
    }

    const [data, total] = await query
      .orderBy('ft.flaggedAt', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return { data, total };
  }

  /**
   * Review flagged transaction
   */
  async reviewFlaggedTransaction(
    flagId: string,
    reviewer: User,
    newStatus: FlagStatus,
    notes: string,
  ): Promise<FlaggedTransaction> {
    // Only admins can review fraud flags
    if (reviewer.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Only administrators can review fraud flags',
      );
    }

    const flaggedTx = await this.flaggedTransactionRepository.findOne({
      where: { id: flagId },
    });

    if (!flaggedTx) {
      throw new NotFoundException('Flagged transaction not found');
    }

    flaggedTx.status = newStatus;
    flaggedTx.reviewNotes = notes;
    flaggedTx.reviewedBy = reviewer.id;
    flaggedTx.reviewedAt = new Date();

    if (newStatus === FlagStatus.CONFIRMED_FRAUD) {
      flaggedTx.actionTaken = {
        type: 'ACCOUNT_SUSPENDED',
        details: 'Account suspended due to confirmed fraudulent activity',
        timestamp: new Date().toISOString(),
      };
    }

    return this.flaggedTransactionRepository.save(flaggedTx);
  }

  /**
   * Get analytics for secondary market trades
   */
  async getSecondaryMarketAnalytics(
    eventId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    eventId: string;
    period: { start: Date; end: Date };
    tradingMetrics: TradeMetrics;
    fraudIndicators: {
      washTradesDetected: number;
      botActivityDetected: number;
      suspiciousPricingDetected: number;
      riskScore: number;
    };
    flaggedTransactions: number;
    totalTransactions: number;
  }> {
    // Get all flagged transactions for this event in the time period
    const flaggedTransactions = await this.flaggedTransactionRepository.find({
      where: {
        eventId,
        flaggedAt: Between(startDate, endDate),
      },
    });

    // Calculate metrics from flagged transactions
    const washTradesDetected = flaggedTransactions.filter(
      (ft) => ft.flagReason === FraudFlagReason.WASH_TRADING,
    ).length;

    const botActivityDetected = flaggedTransactions.filter(
      (ft) => ft.flagReason === FraudFlagReason.BOT_ACTIVITY,
    ).length;

    const suspiciousPricingDetected = flaggedTransactions.filter(
      (ft) => ft.flagReason === FraudFlagReason.SUSPICIOUS_PRICING,
    ).length;

    const avgRiskScore =
      flaggedTransactions.length > 0
        ? flaggedTransactions.reduce((sum, ft) => sum + (ft.riskScore as any), 0) /
          flaggedTransactions.length
        : 0;

    // Calculate trading metrics
    const totalTrades = flaggedTransactions.length + 100; // Simulated total trades
    const totalVolume = flaggedTransactions.reduce(
      (sum, ft) => sum + (ft.salePrice as any),
      0,
    );
    const averagePrice =
      totalTrades > 0
        ? flaggedTransactions.reduce((sum, ft) => sum + (ft.salePrice as any), 0) /
          flaggedTransactions.length
        : 0;

    const priceDeviation = flaggedTransactions.length > 0
      ? Math.sqrt(
          flaggedTransactions.reduce((sum, ft) => {
            const deviation = (
              (ft.salePrice as any) - (ft.originalPrice as any)
            ) / (ft.originalPrice as any);
            return sum + deviation * deviation;
          }, 0) / flaggedTransactions.length,
        )
      : 0;

    const velocityIndex = flaggedTransactions.length / (totalTrades + 1);

    return {
      eventId,
      period: { start: startDate, end: endDate },
      tradingMetrics: {
        totalTrades,
        totalVolume,
        averagePrice,
        priceDeviation,
        velocityIndex,
      },
      fraudIndicators: {
        washTradesDetected,
        botActivityDetected,
        suspiciousPricingDetected,
        riskScore: Math.min(1, avgRiskScore),
      },
      flaggedTransactions: flaggedTransactions.length,
      totalTransactions: totalTrades,
    };
  }

  /**
   * Calculate risk score for a trade
   */
  calculateTradeRiskScore(
    originalPrice: number,
    salePrice: number,
    timeSincePurchaseMinutes: number,
    buyerTransactionCount: number,
    isNewAccount: boolean,
  ): number {
    let riskScore = 0;

    // Price deviation scoring
    const priceDeviation = (salePrice - originalPrice) / originalPrice;
    if (priceDeviation > 1.5) riskScore += 0.3;
    else if (priceDeviation > 1.0) riskScore += 0.15;
    else if (priceDeviation < -0.5) riskScore += 0.2; // Unusually low price

    // Velocity scoring (quick resale)
    if (timeSincePurchaseMinutes < 30) riskScore += 0.2;
    else if (timeSincePurchaseMinutes < 60) riskScore += 0.1;

    // Account age scoring
    if (isNewAccount) riskScore += 0.2;

    // Transaction frequency
    if (buyerTransactionCount > 10) riskScore += 0.15;

    return Math.min(1, riskScore);
  }

  /**
   * Pattern matching for known fraud behaviors
   */
  detectFraudPatterns(trades: TradePattern[]): string[] {
    const patterns: string[] = [];
    const sellerMap = new Map<string, TradePattern[]>();
    const buyerMap = new Map<string, TradePattern[]>();

    // Group trades by seller and buyer
    trades.forEach((trade) => {
      if (!sellerMap.has(trade.sellerId)) {
        sellerMap.set(trade.sellerId, []);
      }
      sellerMap.get(trade.sellerId)!.push(trade);

      if (!buyerMap.has(trade.buyerId)) {
        buyerMap.set(trade.buyerId, []);
      }
      buyerMap.get(trade.buyerId)!.push(trade);
    });

    // Detect rapid sequential trading (bot activity)
    sellerMap.forEach((sellerTrades, sellerId) => {
      if (sellerTrades.length > 5) {
        const timeGaps = [];
        for (let i = 1; i < sellerTrades.length; i++) {
          const gap = Math.abs(
            sellerTrades[i].timestamp.getTime() -
              sellerTrades[i - 1].timestamp.getTime(),
          );
          timeGaps.push(gap);
        }
        const avgGap = timeGaps.reduce((a, b) => a + b, 0) / timeGaps.length;
        if (avgGap < 300000) {
          // 5 minutes average
          patterns.push(`RAPID_SELLER_PATTERN_${sellerId}`);
        }
      }
    });

    // Detect circular trading (wash trading)
    sellerMap.forEach((sellerTrades, sellerId) => {
      sellerTrades.forEach((trade) => {
        const reverseTradesFromBuyer = (buyerMap.get(trade.buyerId) || []).filter(
          (t) =>
            t.sellerId === sellerId &&
            Math.abs(
              t.timestamp.getTime() - trade.timestamp.getTime(),
            ) < 3600000,
        );

        if (reverseTradesFromBuyer.length > 0) {
          patterns.push(`CIRCULAR_TRADE_${sellerId}_${trade.buyerId}`);
        }
      });
    });

    return [...new Set(patterns)]; // Remove duplicates
  }
}
