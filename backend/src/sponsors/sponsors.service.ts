import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { SponsorTier } from './entities/sponsor-tier.entity';
import { SponsorContribution, ContributionStatus } from './entities/sponsor-contribution.entity';
import { Sponsor } from './entities/sponsor.entity';
import { ContributionsService } from './contributions.service';
import { EventsService } from '../events/events.service';
import { CreateSponsorTierDto } from './dto/create-sponsor-tier.dto';
import { UpdateSponsorTierDto } from './dto/update-sponsor-tier.dto';
import { SponsorReportDto } from './dto/sponsor-report.dto';
import { SponsorBannerDto, UpdateSponsorBannerDto } from './dto/sponsor-banner.dto';
import { Event, EventStatus } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { EscrowService } from '../payments/services/escrow.service';
import { StellarService } from '../stellar/stellar.service';
import { AuditService } from '../audit/audit.service';
import { Role } from '../common/decorators/roles.decorator';

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class SponsorsService {
  constructor(
    @InjectRepository(SponsorTier)
    private readonly tierRepository: Repository<SponsorTier>,
    @InjectRepository(SponsorContribution)
    private readonly contributionRepository: Repository<SponsorContribution>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(Sponsor)
    private readonly sponsorRepo: Repository<Sponsor>,
    private readonly eventsService: EventsService,
    private readonly contributionsService: ContributionsService,
    private readonly escrowService: EscrowService,
    private readonly stellarService: StellarService,
    private readonly auditService: AuditService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async confirmSponsorPayment(transactionHash: string): Promise<boolean> {
    try {
      await this.contributionsService.confirmContribution(transactionHash);
      return true;
    } catch (err) {
      if (err instanceof NotFoundException) return false;
      throw err;
    }
  }

  async createTier(
    eventId: string,
    dto: CreateSponsorTierDto,
    requesterId: string,
  ): Promise<SponsorTier> {
    await this.assertEventOrganizer(eventId, requesterId);

    const tier = this.tierRepository.create({ ...dto, eventId });
    return this.tierRepository.save(tier);
  }

  async updateTier(
    id: string,
    dto: UpdateSponsorTierDto,
    requesterId: string,
  ): Promise<SponsorTier> {
    const tier = await this.getTierById(id);
    await this.assertEventOrganizer(tier.eventId, requesterId);

    Object.assign(tier, dto);
    return this.tierRepository.save(tier);
  }

  async deleteTier(id: string, requesterId: string): Promise<void> {
    const tier = await this.getTierById(id);
    await this.assertEventOrganizer(tier.eventId, requesterId);
    await this.tierRepository.remove(tier);
  }

  async listTiers(eventId: string): Promise<SponsorTier[]> {
    return this.tierRepository.find({
      where: { eventId },
      order: { price: 'ASC' },
    });
  }

  async getTierById(id: string): Promise<SponsorTier> {
    const tier = await this.tierRepository.findOne({ where: { id } });
    if (!tier) {
      throw new NotFoundException(`Sponsor tier with id "${id}" not found`);
    }
    return tier;
  }

  async getFundingProgress(eventId: string) {
    const [event, totalRaised, contributorCount] = await Promise.all([
      this.eventsService.getEventById(eventId),
      this.contributionRepository
        .createQueryBuilder('c')
        .innerJoin('c.tier', 'tier')
        .select('SUM(c.amount)', 'total')
        .where('tier.eventId = :eventId AND c.status = :status', {
          eventId,
          status: ContributionStatus.CONFIRMED,
        })
        .getRawOne<{ total: string | null }>(),
      this.contributionRepository
        .createQueryBuilder('c')
        .innerJoin('c.tier', 'tier')
        .select('COUNT(DISTINCT c.sponsorId)', 'count')
        .where('tier.eventId = :eventId AND c.status = :status', {
          eventId,
          status: ContributionStatus.CONFIRMED,
        })
        .getRawOne<{ count: string | null }>(),
    ]);

    const raised = Number(totalRaised?.total ?? 0);
    const goal = event.fundingGoal ? Number(event.fundingGoal) : null;

    return {
      raised,
      goal,
      percentage: goal ? Math.min(100, Math.round((raised / goal) * 100)) : null,
      contributorCount: Number(contributorCount?.count ?? 0),
      goalReached: goal ? raised >= goal : false,
    };
  }

  private async assertEventOrganizer(
    eventId: string,
    requesterId: string,
  ): Promise<void> {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== requesterId) {
      throw new ForbiddenException(
        'Only the event organizer can manage sponsor tiers',
      );
    }
  }

  async distributeEscrow(
    eventId: string,
    callerId: string,
    callerRole: Role,
  ): Promise<{ transactionHash: string; amount: number; recipient: string }> {
    const event = await this.eventsService.getEventById(eventId);

    if (event.organizerId !== callerId && callerRole !== Role.ADMIN) {
      throw new ForbiddenException();
    }

    if (event.status !== EventStatus.COMPLETED) {
      throw new BadRequestException('Only completed events can distribute funds');
    }

    // Re-fetch with escrowSecretEncrypted (select: false on entity)
    const eventWithSecret = await this.eventRepository.findOne({
      where: { id: eventId },
      select: ['id', 'organizerId', 'escrowPublicKey', 'escrowSecretEncrypted'],
    });

    if (!eventWithSecret?.escrowSecretEncrypted) {
      throw new BadRequestException('Event has no escrow account configured');
    }

    const organizer = await this.usersRepository.findOne({
      where: { id: event.organizerId },
      select: ['id', 'stellarPublicKey'],
    });

    if (!organizer?.stellarPublicKey) {
      throw new BadRequestException('Organizer has no linked Stellar wallet');
    }

    const total = await this.getTotalConfirmedContributions(eventId);
    if (total <= 0) {
      throw new BadRequestException('No confirmed contributions to distribute');
    }

    const escrowSecret = await this.escrowService.decryptEscrowSecret(
      eventWithSecret.escrowSecretEncrypted,
    );

    // Atomically claim the distribution. Only the request that flips
    // escrowDistributedAt from NULL to a timestamp wins; any concurrent or
    // retried request sees affected === 0 and is rejected below. This is the
    // guard that prevents the escrow from ever being paid out twice.
    const claim = await this.eventRepository
      .createQueryBuilder()
      .update(Event)
      .set({ escrowDistributedAt: new Date() })
      .where('id = :id', { id: eventId })
      .andWhere('escrowDistributedAt IS NULL')
      .execute();

    if (!claim.affected) {
      throw new ConflictException(
        'Escrow for this event has already been distributed',
      );
    }

    let txResponse: Awaited<ReturnType<StellarService['sendPayment']>>;
    try {
      txResponse = await this.stellarService.sendPayment(
        escrowSecret,
        organizer.stellarPublicKey,
        String(total),
        'XLM',
      );
    } catch (err) {
      // The payout did not happen, so release the claim to allow a retry.
      await this.eventRepository.update(eventId, {
        escrowDistributedAt: null,
      });
      throw err;
    }

    const txHash =
      typeof txResponse.hash === 'string' ? txResponse.hash : 'unknown';

    // Clear the escrow secret now that the funds have been released, so the
    // credentials cannot be reused.
    await this.eventRepository.update(eventId, {
      escrowSecretEncrypted: null,
    });

    await this.auditService.log({
      action: 'ESCROW_RELEASED',
      userId: callerId,
      resourceId: eventId,
      meta: { amount: total, recipient: organizer.stellarPublicKey, transactionHash: txHash },
    });

    return { transactionHash: txHash, amount: total, recipient: organizer.stellarPublicKey };
  }

  private async getTotalConfirmedContributions(eventId: string): Promise<number> {
    const tiers = await this.tierRepository.find({ where: { eventId } });
    if (tiers.length === 0) return 0;

    const tierIds = tiers.map((t) => t.id);
    const result = await this.contributionRepository
      .createQueryBuilder('c')
      .select('SUM(c.amount)', 'total')
      .where('c.tierId IN (:...tierIds)', { tierIds })
      .andWhere('c.status = :status', { status: ContributionStatus.CONFIRMED })
      .getRawOne<{ total: string | null }>();

    return Number(result?.total ?? 0);
  }

  async getEventLeaderboard(eventId: string): Promise<any[]> {
    const cacheKey = `leaderboard:${eventId}`;
    const cached = await this.cacheManager.get<any[]>(cacheKey);
    if (cached) return cached;

    const contributions = await this.contributionRepository
      .createQueryBuilder('contribution')
      .innerJoin('contribution.tier', 'tier')
      .innerJoinAndSelect('contribution.sponsor', 'sponsor')
      .select([
        'sponsor.displayName as "displayName"',
        'sponsor.logoUrl as "logoUrl"',
        'tier.name as "tierName"',
        'SUM(contribution.amount) as "totalXlm"',
      ])
      .where('tier.eventId = :eventId', { eventId })
      .andWhere('contribution.status = :status', {
        status: ContributionStatus.CONFIRMED,
      })
      .groupBy(
        'sponsor.displayName, sponsor.logoUrl, tier.name',
      )
      .orderBy('"totalXlm"', 'DESC')
      .getRawMany();

    const leaderboard = contributions.map((c, i) => ({
      rank: i + 1,
      ...c,
      totalXlm: Number(c.totalXlm),
    }));

    await this.cacheManager.set(cacheKey, leaderboard, 300);
    return leaderboard;
  }

  /**
   * Returns this event's active sponsor banners in a weighted-random display
   * order (Efraimidis-Spirakis weighted sampling) — higher `weight` sponsors
   * are more likely to sort first on any given rotation. A weight of 0 pauses
   * a sponsor's banner without deactivating it.
   */
  async rotateSponsorBanners(
    eventId: string,
    random: () => number = Math.random,
  ): Promise<SponsorBannerDto[]> {
    const sponsors = await this.sponsorRepo.find({
      where: { eventId, isActive: true, weight: MoreThan(0) },
    });

    return sponsors
      .map((sponsor) => ({ sponsor, key: Math.pow(random(), 1 / sponsor.weight) }))
      .sort((a, b) => b.key - a.key)
      .map(({ sponsor }) => toBannerDto(sponsor));
  }

  /** Counts a banner view. Only banners that are currently in rotation count. */
  async recordSponsorImpression(sponsorId: string): Promise<void> {
    await this.incrementBannerCounter(sponsorId, 'impressionCount');
  }

  /** Counts a banner click-through. Only banners that are currently in rotation count. */
  async recordSponsorClick(sponsorId: string): Promise<void> {
    await this.incrementBannerCounter(sponsorId, 'clickCount');
  }

  private async incrementBannerCounter(
    sponsorId: string,
    column: 'impressionCount' | 'clickCount',
  ): Promise<void> {
    const result = await this.sponsorRepo.increment(
      { id: sponsorId, isActive: true, weight: MoreThan(0) },
      column,
      1,
    );
    if (!result.affected) {
      throw new NotFoundException(`Sponsor banner "${sponsorId}" not found`);
    }
  }

  /** Organizer-only: adjust a sponsor's rotation weight and/or pause its banner. */
  async updateSponsorBanner(
    eventId: string,
    sponsorId: string,
    dto: UpdateSponsorBannerDto,
    requesterId: string,
  ): Promise<SponsorBannerDto & { weight: number; isActive: boolean }> {
    await this.assertEventOrganizer(eventId, requesterId);

    const sponsor = await this.sponsorRepo.findOne({ where: { id: sponsorId, eventId } });
    if (!sponsor) {
      throw new NotFoundException(`Sponsor "${sponsorId}" not found for this event`);
    }

    if (dto.weight !== undefined) sponsor.weight = dto.weight;
    if (dto.isActive !== undefined) sponsor.isActive = dto.isActive;
    const saved = await this.sponsorRepo.save(sponsor);

    return { ...toBannerDto(saved), weight: saved.weight, isActive: saved.isActive };
  }

  async generateSponsorReport(
    eventId: string,
    requesterId: string,
  ): Promise<SponsorReportDto> {
    await this.assertEventOrganizer(eventId, requesterId);

    const sponsors = await this.sponsorRepo.find({ where: { eventId } });

    const totalImpressions = sponsors.reduce((sum, s) => sum + s.impressionCount, 0);
    const totalClicks = sponsors.reduce((sum, s) => sum + s.clickCount, 0);
    const rotatingWeight = sponsors
      .filter((s) => s.isActive && s.weight > 0)
      .reduce((sum, s) => sum + s.weight, 0);

    return {
      eventId,
      totalImpressions,
      totalClicks,
      clickThroughRate: ratio(totalClicks, totalImpressions),
      sponsors: sponsors
        .map((sponsor) => ({
          sponsorId: sponsor.id,
          displayName: sponsor.displayName,
          weight: sponsor.weight,
          isActive: sponsor.isActive,
          impressions: sponsor.impressionCount,
          clicks: sponsor.clickCount,
          clickThroughRate: ratio(sponsor.clickCount, sponsor.impressionCount),
          impressionShare: ratio(sponsor.impressionCount, totalImpressions),
          expectedShare:
            sponsor.isActive && sponsor.weight > 0 ? ratio(sponsor.weight, rotatingWeight) : 0,
        }))
        .sort((a, b) => b.impressions - a.impressions),
    };
  }

  async getSponsorProfile(userId: string): Promise<any> {
    const contributions = await this.sponsorRepo.find({
      where: { userId },
      relations: ['event'],
      order: { createdAt: 'DESC' },
    });
    if (!contributions.length) return { userId, events: [] };
    const latest = contributions[0];
    return {
      userId,
      displayName: latest.displayName,
      logoUrl: latest.logoUrl,
      websiteUrl: latest.websiteUrl,
      totalContributed: contributions.reduce((sum, c) => sum + Number(c.amount), 0),
      events: contributions.map((c) => ({
        eventId: c.eventId,
        title: c.event?.title,
        amount: c.amount,
        date: c.createdAt,
      })),
    };
  }
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;
}

/** Only http(s) URLs are safe to render as a link/image on the public event page. */
function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:' ? value : null;
  } catch {
    return null;
  }
}

/** Public projection of a sponsor — no amounts, wallet or user identifiers. */
function toBannerDto(sponsor: Sponsor): SponsorBannerDto {
  return {
    id: sponsor.id,
    displayName: sponsor.displayName,
    logoUrl: safeHttpUrl(sponsor.logoUrl),
    websiteUrl: safeHttpUrl(sponsor.websiteUrl),
  };
}
