import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { ResaleTransaction } from '../resale-transaction.entity';
import { AuditService } from '../../../audit/audit.service';
import { AuditAction } from '../../../audit/entities/audit-log.entity';
import { FraudFlag, FraudReason, FraudRiskLevel } from './fraud-flag.entity';
import { AnalyzeTradeDto } from './dto/analyze-trade.dto';

export interface TradeAnalysisResult {
  riskScore: number;
  riskLevel: FraudRiskLevel;
  reasons: FraudReason[];
}

/**
 * #908: rule-based risk scoring for the secondary ticket market.
 *
 * Each rule contributes an independent score; scores are summed and capped at
 * 100. Kept deterministic and modular so a future ML-based scorer can replace
 * or augment individual rules without changing the public API.
 */
const WASH_TRADING_PAIR_THRESHOLD = 2; // prior trades between the same two parties
const WASH_TRADING_SCORE = 40;

const BOT_VELOCITY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const BOT_VELOCITY_THRESHOLD = 3; // trades by the same buyer within the window
const BOT_VELOCITY_SCORE = 35;

const PRICE_DEVIATION_RATIO = 0.5; // 50% deviation from recent average
const PRICE_ANOMALY_SCORE = 30;

const HIGH_RISK_THRESHOLD = 70;
const MEDIUM_RISK_THRESHOLD = 40;

@Injectable()
export class FraudDetectionService {
  private readonly logger = new Logger(FraudDetectionService.name);

  constructor(
    @InjectRepository(ResaleTransaction)
    private readonly resaleTransactionRepo: Repository<ResaleTransaction>,
    @InjectRepository(FraudFlag)
    private readonly fraudFlagRepo: Repository<FraudFlag>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Evaluate a trade against configurable heuristics and return a risk score
   * (0-100), risk level, and the specific reasons that contributed to it.
   * Deterministic and read-only — does not itself flag or hold anything.
   */
  async analyzeTradePatterns(trade: AnalyzeTradeDto): Promise<TradeAnalysisResult> {
    const reasons: FraudReason[] = [];
    let riskScore = 0;

    const priorPairTrades = await this.resaleTransactionRepo.count({
      where: [
        { buyerId: trade.buyerId, sellerId: trade.sellerId },
        { buyerId: trade.sellerId, sellerId: trade.buyerId },
      ],
    });
    if (priorPairTrades >= WASH_TRADING_PAIR_THRESHOLD) {
      reasons.push(FraudReason.WASH_TRADING);
      riskScore += WASH_TRADING_SCORE;
    }

    const windowStart = new Date(Date.now() - BOT_VELOCITY_WINDOW_MS);
    const recentBuyerTrades = await this.resaleTransactionRepo.count({
      where: { buyerId: trade.buyerId, createdAt: MoreThan(windowStart) },
    });
    if (recentBuyerTrades >= BOT_VELOCITY_THRESHOLD) {
      reasons.push(FraudReason.BOT_ACTIVITY);
      riskScore += BOT_VELOCITY_SCORE;
    }

    const avgRow = await this.resaleTransactionRepo
      .createQueryBuilder('r')
      .select('AVG(r.salePrice)', 'avg')
      .where('r.eventId = :eventId', { eventId: trade.eventId })
      .getRawOne<{ avg: string | null }>();
    const avgPrice = avgRow?.avg ? Number(avgRow.avg) : null;

    if (avgPrice && avgPrice > 0) {
      const deviation = Math.abs(trade.price - avgPrice) / avgPrice;
      if (deviation > PRICE_DEVIATION_RATIO) {
        reasons.push(FraudReason.PRICE_ANOMALY);
        riskScore += PRICE_ANOMALY_SCORE;
      }
    }

    riskScore = Math.min(riskScore, 100);
    const riskLevel =
      riskScore >= HIGH_RISK_THRESHOLD
        ? FraudRiskLevel.HIGH
        : riskScore >= MEDIUM_RISK_THRESHOLD
          ? FraudRiskLevel.MEDIUM
          : FraudRiskLevel.LOW;

    return { riskScore, riskLevel, reasons };
  }

  /**
   * Persist a fraud flag for a trade based on a prior `analyzeTradePatterns`
   * result. High-risk trades are placed on hold immediately.
   */
  async flagFraudulentTransaction(
    trade: AnalyzeTradeDto,
    analysis: TradeAnalysisResult,
  ): Promise<FraudFlag> {
    const flag = this.fraudFlagRepo.create({
      ticketId: trade.ticketId,
      eventId: trade.eventId,
      buyerId: trade.buyerId,
      sellerId: trade.sellerId,
      price: trade.price,
      riskScore: analysis.riskScore,
      riskLevel: analysis.riskLevel,
      reasons: analysis.reasons,
      onHold: analysis.riskLevel === FraudRiskLevel.HIGH,
    });
    const saved = await this.fraudFlagRepo.save(flag);

    this.logger.warn(
      `Trade flagged: ticket=${trade.ticketId} risk=${analysis.riskLevel} score=${analysis.riskScore} reasons=${analysis.reasons.join(',')}`,
    );
    await this.auditService.log({
      action: AuditAction.TRADE_FLAGGED_FRAUD,
      userId: trade.buyerId,
      resourceId: trade.ticketId,
      meta: {
        riskScore: analysis.riskScore,
        riskLevel: analysis.riskLevel,
        reasons: analysis.reasons,
        fraudFlagId: saved.id,
      },
    });

    return saved;
  }

  /**
   * Place a flagged trade on hold, preventing settlement until manually reviewed.
   */
  async holdSuspiciousTrade(flagId: string): Promise<FraudFlag> {
    const flag = await this.fraudFlagRepo.findOne({ where: { id: flagId } });
    if (!flag) throw new NotFoundException('Fraud flag not found');

    flag.onHold = true;
    const saved = await this.fraudFlagRepo.save(flag);

    await this.auditService.log({
      action: AuditAction.TRADE_HELD_FOR_REVIEW,
      userId: flag.buyerId,
      resourceId: flag.ticketId,
      meta: { fraudFlagId: flag.id, riskLevel: flag.riskLevel },
    });

    return saved;
  }

  /**
   * Manual-review workflow: release a hold after a reviewer clears the trade.
   */
  async releaseTradeHold(flagId: string, reviewerId: string): Promise<FraudFlag> {
    const flag = await this.fraudFlagRepo.findOne({ where: { id: flagId } });
    if (!flag) throw new NotFoundException('Fraud flag not found');

    flag.onHold = false;
    flag.resolved = true;
    flag.reviewedBy = reviewerId;
    const saved = await this.fraudFlagRepo.save(flag);

    await this.auditService.log({
      action: AuditAction.TRADE_HOLD_RELEASED,
      userId: reviewerId,
      resourceId: flag.ticketId,
      meta: { fraudFlagId: flag.id },
    });

    return saved;
  }

  async getFlagsForTicket(ticketId: string): Promise<FraudFlag[]> {
    return this.fraudFlagRepo.find({ where: { ticketId }, order: { createdAt: 'DESC' } });
  }

  /**
   * Convenience entry point for the resale flow: analyze a trade and, if it
   * scores as suspicious, record a flag (and hold it, for high risk). Legitimate
   * (low-risk) trades incur no flag and no interruption.
   */
  async evaluateTrade(
    trade: AnalyzeTradeDto,
  ): Promise<{ analysis: TradeAnalysisResult; flag: FraudFlag | null }> {
    const analysis = await this.analyzeTradePatterns(trade);
    if (analysis.riskLevel === FraudRiskLevel.LOW) {
      return { analysis, flag: null };
    }
    const flag = await this.flagFraudulentTransaction(trade, analysis);
    return { analysis, flag };
  }
}
