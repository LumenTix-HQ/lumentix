import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { GeoFenceRule } from './entities/geo-fence-rule.entity';
import { GeoFenceRuleType } from './enums/geo-fence-rule-type.enum';
import { SetGeoFenceRulesDto, GeoFenceRuleInputDto } from './dto/set-geo-fence-rules.dto';
import { ValidateBuyerLocationDto } from './dto/validate-buyer-location.dto';
import {
  GeoFenceValidationResultDto,
  RuleEvaluationDetailDto,
} from './dto/geo-fence-validation-result.dto';
import { RadiusConfigDto } from './dto/radius-config.dto';
import { BoundingBoxConfigDto } from './dto/bounding-box-config.dto';
import { CountryListConfigDto } from './dto/country-list-config.dto';
import { Event } from '../events/entities/event.entity';

// ── Haversine helper ────────────────────────────────────────────────────────

/**
 * Returns the great-circle distance between two geographic points in
 * kilometres using the Haversine formula.
 */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Config validation helpers ───────────────────────────────────────────────

async function validateRadiusConfig(raw: Record<string, unknown>): Promise<RadiusConfigDto> {
  const instance = plainToInstance(RadiusConfigDto, raw);
  const errors = await validate(instance);
  if (errors.length) {
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    throw new BadRequestException(`Invalid RADIUS config: ${messages.join('; ')}`);
  }
  return instance;
}

async function validateBoundingBoxConfig(
  raw: Record<string, unknown>,
): Promise<BoundingBoxConfigDto> {
  const instance = plainToInstance(BoundingBoxConfigDto, raw);
  const errors = await validate(instance);
  if (errors.length) {
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    throw new BadRequestException(`Invalid BOUNDING_BOX config: ${messages.join('; ')}`);
  }
  if (instance.minLat >= instance.maxLat) {
    throw new BadRequestException('BOUNDING_BOX: minLat must be less than maxLat');
  }
  if (instance.minLng >= instance.maxLng) {
    throw new BadRequestException('BOUNDING_BOX: minLng must be less than maxLng');
  }
  return instance;
}

async function validateCountryListConfig(
  raw: Record<string, unknown>,
): Promise<CountryListConfigDto> {
  const instance = plainToInstance(CountryListConfigDto, raw);
  const errors = await validate(instance);
  if (errors.length) {
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    throw new BadRequestException(`Invalid COUNTRY_LIST config: ${messages.join('; ')}`);
  }
  return instance;
}

// ── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class GeoFenceService {
  private readonly logger = new Logger(GeoFenceService.name);

  constructor(
    @InjectRepository(GeoFenceRule)
    private readonly ruleRepo: Repository<GeoFenceRule>,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
  ) {}

  // ── set_geo_fence_rules ────────────────────────────────────────────────────

  /**
   * Replaces all geo-fence rules for an event with the provided list.
   *
   * Only the event's organizer may call this. Existing rules are deleted
   * and the new set is inserted atomically using a TypeORM transaction.
   * Pass an empty `rules` array to remove all restrictions.
   *
   * Each rule's `config` is validated against its type-specific DTO before
   * anything is persisted.
   */
  async setGeoFenceRules(
    eventId: string,
    callerId: string,
    dto: SetGeoFenceRulesDto,
  ): Promise<GeoFenceRule[]> {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found`);
    }
    if (event.organizerId !== callerId) {
      throw new ForbiddenException('Only the event organizer can manage geo-fence rules.');
    }

    // Validate each rule's config before touching the DB
    const validatedRules = await Promise.all(
      dto.rules.map((rule) => this.validateRuleInput(rule)),
    );

    // Replace rules atomically
    await this.ruleRepo.manager.transaction(async (em) => {
      await em.delete(GeoFenceRule, { eventId });
      if (validatedRules.length > 0) {
        const entities = validatedRules.map((rule) =>
          em.create(GeoFenceRule, {
            eventId,
            createdBy: callerId,
            ruleType: rule.ruleType,
            description: rule.description ?? null,
            config: rule.config,
            isEnabled: rule.isEnabled ?? true,
          }),
        );
        await em.save(GeoFenceRule, entities);
      }
    });

    this.logger.log(
      `Geo-fence rules updated for event ${eventId} by organizer ${callerId}: ` +
        `${validatedRules.length} rule(s) set.`,
    );

    return this.ruleRepo.find({ where: { eventId }, order: { createdAt: 'ASC' } });
  }

  // ── validate_buyer_location ────────────────────────────────────────────────

  /**
   * Evaluates all enabled geo-fence rules for an event against the buyer's
   * supplied location data.
   *
   * Returns a detailed result indicating whether the purchase is allowed
   * and the outcome of each individual rule.
   *
   * Rules are combined with AND logic — ALL enabled rules must pass.
   * If the event has no enabled rules, the purchase is always allowed.
   */
  async validateBuyerLocation(
    eventId: string,
    locationDto: ValidateBuyerLocationDto,
  ): Promise<GeoFenceValidationResultDto> {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found`);
    }

    const rules = await this.ruleRepo.find({
      where: { eventId, isEnabled: true },
      order: { createdAt: 'ASC' },
    });

    if (rules.length === 0) {
      return {
        allowed: true,
        denialReason: null,
        details: [],
      };
    }

    const details: RuleEvaluationDetailDto[] = rules.map((rule) =>
      this.evaluateRule(rule, locationDto),
    );

    const failedDetails = details.filter((d) => !d.passed);
    const allowed = failedDetails.length === 0;

    const denialReason = allowed
      ? null
      : failedDetails.map((d) => d.reason).join(' | ');

    return { allowed, denialReason, details };
  }

  // ── enforce_geo_restriction ────────────────────────────────────────────────

  /**
   * Hard enforcement gate called at ticket purchase time.
   *
   * Runs validate_buyer_location and throws a ForbiddenException if the
   * buyer's location does not satisfy all geo-fence rules for the event.
   * If the event has no geo-fence rules the call is a no-op.
   *
   * @throws ForbiddenException with a buyer-facing denial reason.
   */
  async enforceGeoRestriction(
    eventId: string,
    locationDto: ValidateBuyerLocationDto,
  ): Promise<void> {
    const result = await this.validateBuyerLocation(eventId, locationDto);

    if (!result.allowed) {
      this.logger.warn(
        `Geo-fence blocked ticket purchase for event ${eventId}: ${result.denialReason}`,
      );
      throw new ForbiddenException(
        `Ticket purchase not allowed from your location: ${result.denialReason}`,
      );
    }
  }

  // ── Query helpers (used by controller) ────────────────────────────────────

  async getRulesForEvent(eventId: string): Promise<GeoFenceRule[]> {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException(`Event "${eventId}" not found`);
    return this.ruleRepo.find({ where: { eventId }, order: { createdAt: 'ASC' } });
  }

  async deleteRulesForEvent(eventId: string, callerId: string): Promise<void> {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException(`Event "${eventId}" not found`);
    if (event.organizerId !== callerId) {
      throw new ForbiddenException('Only the event organizer can delete geo-fence rules.');
    }
    await this.ruleRepo.delete({ eventId });
    this.logger.log(`All geo-fence rules removed for event ${eventId} by organizer ${callerId}`);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Type-safe config validation before persistence */
  private async validateRuleInput(rule: GeoFenceRuleInputDto): Promise<GeoFenceRuleInputDto> {
    switch (rule.ruleType) {
      case GeoFenceRuleType.RADIUS:
        await validateRadiusConfig(rule.config);
        break;
      case GeoFenceRuleType.BOUNDING_BOX:
        await validateBoundingBoxConfig(rule.config);
        break;
      case GeoFenceRuleType.COUNTRY_ALLOWLIST:
      case GeoFenceRuleType.COUNTRY_BLOCKLIST:
        await validateCountryListConfig(rule.config);
        break;
    }
    return rule;
  }

  /**
   * Evaluates a single rule against the supplied buyer location.
   * Returns a RuleEvaluationDetailDto with the pass/fail outcome and reason.
   */
  private evaluateRule(
    rule: GeoFenceRule,
    location: ValidateBuyerLocationDto,
  ): RuleEvaluationDetailDto {
    const base = {
      ruleId: rule.id,
      ruleType: rule.ruleType,
      description: rule.description,
    };

    switch (rule.ruleType) {
      case GeoFenceRuleType.RADIUS:
        return { ...base, ...this.evaluateRadius(rule, location) };

      case GeoFenceRuleType.BOUNDING_BOX:
        return { ...base, ...this.evaluateBoundingBox(rule, location) };

      case GeoFenceRuleType.COUNTRY_ALLOWLIST:
        return { ...base, ...this.evaluateCountryAllowlist(rule, location) };

      case GeoFenceRuleType.COUNTRY_BLOCKLIST:
        return { ...base, ...this.evaluateCountryBlocklist(rule, location) };

      default:
        return {
          ...base,
          passed: false,
          reason: `Unknown rule type "${rule.ruleType as string}" — denied for safety`,
        };
    }
  }

  private evaluateRadius(
    rule: GeoFenceRule,
    location: ValidateBuyerLocationDto,
  ): Pick<RuleEvaluationDetailDto, 'passed' | 'reason'> {
    const { centerLat, centerLng, radiusKm } = rule.config as {
      centerLat: number;
      centerLng: number;
      radiusKm: number;
    };

    if (location.latitude == null || location.longitude == null) {
      return {
        passed: false,
        reason: `RADIUS rule requires GPS coordinates — none provided.`,
      };
    }

    const distKm = haversineKm(
      location.latitude,
      location.longitude,
      centerLat,
      centerLng,
    );

    const passed = distKm <= radiusKm;
    return {
      passed,
      reason: passed
        ? `Location is ${distKm.toFixed(1)} km from the centre — within the ${radiusKm} km radius.`
        : `Location is ${distKm.toFixed(1)} km from the centre — outside the ${radiusKm} km radius.`,
    };
  }

  private evaluateBoundingBox(
    rule: GeoFenceRule,
    location: ValidateBuyerLocationDto,
  ): Pick<RuleEvaluationDetailDto, 'passed' | 'reason'> {
    const { minLat, maxLat, minLng, maxLng } = rule.config as {
      minLat: number;
      maxLat: number;
      minLng: number;
      maxLng: number;
    };

    if (location.latitude == null || location.longitude == null) {
      return {
        passed: false,
        reason: `BOUNDING_BOX rule requires GPS coordinates — none provided.`,
      };
    }

    const { latitude: lat, longitude: lng } = location;
    const passed = lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;

    return {
      passed,
      reason: passed
        ? `Location (${lat}, ${lng}) is inside the allowed bounding box.`
        : `Location (${lat}, ${lng}) is outside the allowed bounding box ` +
          `[${minLat}–${maxLat} lat, ${minLng}–${maxLng} lng].`,
    };
  }

  private evaluateCountryAllowlist(
    rule: GeoFenceRule,
    location: ValidateBuyerLocationDto,
  ): Pick<RuleEvaluationDetailDto, 'passed' | 'reason'> {
    const { countryCodes } = rule.config as { countryCodes: string[] };

    if (!location.countryCode) {
      return {
        passed: false,
        reason: `COUNTRY_ALLOWLIST rule requires a country code — none provided.`,
      };
    }

    const passed = countryCodes.includes(location.countryCode);
    return {
      passed,
      reason: passed
        ? `Country ${location.countryCode} is in the allowed list.`
        : `Country ${location.countryCode} is not in the allowed list: [${countryCodes.join(', ')}].`,
    };
  }

  private evaluateCountryBlocklist(
    rule: GeoFenceRule,
    location: ValidateBuyerLocationDto,
  ): Pick<RuleEvaluationDetailDto, 'passed' | 'reason'> {
    const { countryCodes } = rule.config as { countryCodes: string[] };

    if (!location.countryCode) {
      // No country code provided — deny by default for blocklist rules
      return {
        passed: false,
        reason: `COUNTRY_BLOCKLIST rule requires a country code — none provided; denied for safety.`,
      };
    }

    const blocked = countryCodes.includes(location.countryCode);
    return {
      passed: !blocked,
      reason: blocked
        ? `Country ${location.countryCode} is on the restricted list.`
        : `Country ${location.countryCode} is not on the restricted list.`,
    };
  }
}
