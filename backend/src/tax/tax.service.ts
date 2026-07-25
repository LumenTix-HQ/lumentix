import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import {
  TaxCollectionRecord,
  TaxJurisdictionType,
  TaxReport,
  TaxRule,
} from './entities/tax.entity';
import {
  CalculateTaxDto,
  ExportTaxReportDto,
  RecordTaxCollectionDto,
  RegisterTaxRuleDto,
} from './dto/tax.dto';

export interface TaxCalculationResult {
  eventId: string;
  basePrice: number;
  taxAmount: number;
  totalPrice: number;
  effectiveRateBps: number;
  jurisdictionCode: string;
  currency: string;
  calculatedAt: string;
}

@Injectable()
export class TaxService {
  constructor(
    @InjectRepository(TaxRule)
    private readonly taxRuleRepository: Repository<TaxRule>,
    @InjectRepository(TaxCollectionRecord)
    private readonly taxCollectionRepository: Repository<TaxCollectionRecord>,
    @InjectRepository(TaxReport)
    private readonly taxReportRepository: Repository<TaxReport>,
  ) {}

  // ── Tax Rule Management ─────────────────────────────────────────────────────

  /**
   * Register or update a tax rule for a jurisdiction.
   * If a rule already exists for the jurisdiction code, it is updated (upsert).
   */
  async registerTaxRule(dto: RegisterTaxRuleDto): Promise<TaxRule> {
    let rule = await this.taxRuleRepository.findOne({
      where: { jurisdictionCode: dto.jurisdictionCode },
    });

    if (rule) {
      // Update existing rule
      rule.jurisdictionName = dto.jurisdictionName;
      rule.jurisdictionType = dto.jurisdictionType;
      rule.rateBps = dto.rateBps;
      if (dto.isActive !== undefined) {
        rule.isActive = dto.isActive;
      }
    } else {
      rule = this.taxRuleRepository.create({
        jurisdictionCode: dto.jurisdictionCode,
        jurisdictionName: dto.jurisdictionName,
        jurisdictionType: dto.jurisdictionType,
        rateBps: dto.rateBps,
        isActive: dto.isActive ?? true,
      });
    }

    return this.taxRuleRepository.save(rule);
  }

  async getTaxRule(jurisdictionCode: string): Promise<TaxRule> {
    const rule = await this.taxRuleRepository.findOne({
      where: { jurisdictionCode },
    });
    if (!rule) {
      throw new NotFoundException(
        `No tax rule found for jurisdiction: ${jurisdictionCode}`,
      );
    }
    return rule;
  }

  async listTaxRules(): Promise<TaxRule[]> {
    return this.taxRuleRepository.find({ order: { jurisdictionCode: 'ASC' } });
  }

  // ── Tax Calculation ─────────────────────────────────────────────────────────

  /**
   * Calculate the sales tax for a ticket purchase without persisting anything.
   * This is a read-only operation — call `recordTaxCollection` to persist.
   */
  async calculateTicketSalesTax(
    dto: CalculateTaxDto,
  ): Promise<TaxCalculationResult> {
    if (dto.basePrice <= 0) {
      throw new BadRequestException('basePrice must be greater than 0');
    }

    const rule = await this.getTaxRule(dto.jurisdictionCode);

    if (!rule.isActive) {
      throw new BadRequestException(
        `Tax rule for ${dto.jurisdictionCode} is inactive`,
      );
    }

    // taxAmount = basePrice × rateBps / 10_000  (floor division)
    const taxAmount = Math.floor((dto.basePrice * rule.rateBps) / 10_000);
    const totalPrice = dto.basePrice + taxAmount;

    return {
      eventId: dto.eventId,
      basePrice: dto.basePrice,
      taxAmount,
      totalPrice,
      effectiveRateBps: rule.rateBps,
      jurisdictionCode: rule.jurisdictionCode,
      currency: dto.currency ?? 'USD',
      calculatedAt: new Date().toISOString(),
    };
  }

  // ── Tax Collection Recording ────────────────────────────────────────────────

  /**
   * Record an immutable tax collection event after a ticket purchase.
   * The tax amount is derived from the active rule for the jurisdiction.
   */
  async recordTaxCollection(
    dto: RecordTaxCollectionDto,
    basePrice: number,
  ): Promise<TaxCollectionRecord> {
    if (basePrice <= 0) {
      throw new BadRequestException('basePrice must be greater than 0');
    }

    const rule = await this.getTaxRule(dto.jurisdictionCode);

    if (!rule.isActive) {
      throw new BadRequestException(
        `Tax rule for ${dto.jurisdictionCode} is inactive`,
      );
    }

    const taxAmount = Math.floor((basePrice * rule.rateBps) / 10_000);

    const record = this.taxCollectionRepository.create({
      ticketId: dto.ticketId,
      eventId: dto.eventId,
      purchaserAddress: dto.purchaserAddress,
      taxAmount,
      currency: dto.currency ?? 'USD',
      jurisdictionCode: dto.jurisdictionCode,
      collectedAt: new Date(),
      remitted: false,
    });

    return this.taxCollectionRepository.save(record);
  }

  async getTaxCollectionRecord(id: string): Promise<TaxCollectionRecord> {
    const record = await this.taxCollectionRepository.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Tax collection record ${id} not found`);
    }
    return record;
  }

  async listTaxCollectionRecords(
    jurisdictionCode?: string,
    eventId?: string,
  ): Promise<TaxCollectionRecord[]> {
    const where: Partial<TaxCollectionRecord> = {};
    if (jurisdictionCode) where.jurisdictionCode = jurisdictionCode;
    if (eventId) where.eventId = eventId;

    return this.taxCollectionRepository.find({
      where,
      order: { collectedAt: 'DESC' },
    });
  }

  // ── Tax Report Export ───────────────────────────────────────────────────────

  /**
   * Aggregate all tax collection records for a jurisdiction within the given
   * time window and persist an immutable TaxReport.
   */
  async exportTaxReports(
    dto: ExportTaxReportDto,
    exportedByUserId: string,
  ): Promise<TaxReport> {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);

    if (periodStart >= periodEnd) {
      throw new BadRequestException('periodStart must be before periodEnd');
    }

    const currency = dto.currency ?? 'USD';

    const records = await this.taxCollectionRepository.find({
      where: {
        jurisdictionCode: dto.jurisdictionCode,
        currency,
        collectedAt: Between(periodStart, periodEnd),
      },
    });

    if (records.length === 0) {
      throw new NotFoundException(
        `No tax collection records found for jurisdiction ${dto.jurisdictionCode} ` +
          `in the specified period`,
      );
    }

    const totalTaxCollected = records.reduce(
      (sum, r) => sum + Number(r.taxAmount),
      0,
    );

    const report = this.taxReportRepository.create({
      jurisdictionCode: dto.jurisdictionCode,
      recordCount: records.length,
      totalTaxCollected,
      currency,
      periodStart,
      periodEnd,
      exportedBy: exportedByUserId,
    });

    return this.taxReportRepository.save(report);
  }

  async getTaxReport(id: string): Promise<TaxReport> {
    const report = await this.taxReportRepository.findOne({ where: { id } });
    if (!report) {
      throw new NotFoundException(`Tax report ${id} not found`);
    }
    return report;
  }

  async listTaxReports(jurisdictionCode?: string): Promise<TaxReport[]> {
    const where: Partial<TaxReport> = {};
    if (jurisdictionCode) where.jurisdictionCode = jurisdictionCode;

    return this.taxReportRepository.find({
      where,
      order: { generatedAt: 'DESC' },
    });
  }

  // ── Utility ─────────────────────────────────────────────────────────────────

  /**
   * Determine the applicable jurisdiction for a purchase based on
   * country/state code.  Falls back to the country-level rule if no
   * state-specific rule exists.
   */
  async resolveJurisdiction(
    countryCode: string,
    stateCode?: string,
  ): Promise<TaxRule | null> {
    // Try state-level first (e.g. "US-CA")
    if (stateCode) {
      const stateKey = `${countryCode}-${stateCode}`.toUpperCase();
      const stateRule = await this.taxRuleRepository.findOne({
        where: { jurisdictionCode: stateKey, isActive: true },
      });
      if (stateRule) return stateRule;
    }

    // Fall back to country-level
    const countryRule = await this.taxRuleRepository.findOne({
      where: {
        jurisdictionCode: countryCode.toUpperCase(),
        jurisdictionType: TaxJurisdictionType.COUNTRY,
        isActive: true,
      },
    });
    return countryRule ?? null;
  }

  /**
   * Seed default tax rules for common jurisdictions.
   * Idempotent — skips rules that already exist.
   */
  async seedDefaultRules(): Promise<void> {
    const defaults: RegisterTaxRuleDto[] = [
      { jurisdictionCode: 'US-CA', jurisdictionName: 'California', jurisdictionType: TaxJurisdictionType.US_STATE, rateBps: 875 },
      { jurisdictionCode: 'US-NY', jurisdictionName: 'New York', jurisdictionType: TaxJurisdictionType.US_STATE, rateBps: 800 },
      { jurisdictionCode: 'US-TX', jurisdictionName: 'Texas', jurisdictionType: TaxJurisdictionType.US_STATE, rateBps: 625 },
      { jurisdictionCode: 'US-FL', jurisdictionName: 'Florida', jurisdictionType: TaxJurisdictionType.US_STATE, rateBps: 600 },
      { jurisdictionCode: 'US-WA', jurisdictionName: 'Washington', jurisdictionType: TaxJurisdictionType.US_STATE, rateBps: 1030 },
      { jurisdictionCode: 'US-OR', jurisdictionName: 'Oregon', jurisdictionType: TaxJurisdictionType.US_STATE, rateBps: 0 },
      { jurisdictionCode: 'GB', jurisdictionName: 'United Kingdom', jurisdictionType: TaxJurisdictionType.COUNTRY, rateBps: 2000 },
      { jurisdictionCode: 'DE', jurisdictionName: 'Germany', jurisdictionType: TaxJurisdictionType.COUNTRY, rateBps: 1900 },
      { jurisdictionCode: 'FR', jurisdictionName: 'France', jurisdictionType: TaxJurisdictionType.COUNTRY, rateBps: 2000 },
      { jurisdictionCode: 'AU', jurisdictionName: 'Australia', jurisdictionType: TaxJurisdictionType.COUNTRY, rateBps: 1000 },
      { jurisdictionCode: 'CA', jurisdictionName: 'Canada', jurisdictionType: TaxJurisdictionType.COUNTRY, rateBps: 500 },
      { jurisdictionCode: 'JP', jurisdictionName: 'Japan', jurisdictionType: TaxJurisdictionType.COUNTRY, rateBps: 1000 },
      { jurisdictionCode: 'IN', jurisdictionName: 'India', jurisdictionType: TaxJurisdictionType.COUNTRY, rateBps: 1800 },
      { jurisdictionCode: 'BR', jurisdictionName: 'Brazil', jurisdictionType: TaxJurisdictionType.COUNTRY, rateBps: 1200 },
    ];

    for (const rule of defaults) {
      const exists = await this.taxRuleRepository.findOne({
        where: { jurisdictionCode: rule.jurisdictionCode },
      });
      if (!exists) {
        await this.registerTaxRule(rule);
      }
    }
  }
}
