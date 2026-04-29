import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SponsorTier } from './entities/sponsor-tier.entity';
import { SponsorContribution, ContributionStatus } from './entities/sponsor-contribution.entity';
import { ContributionsService } from './contributions.service';
import { EventsService } from '../events/events.service';
import { CreateSponsorTierDto } from './dto/create-sponsor-tier.dto';
import { UpdateSponsorTierDto } from './dto/update-sponsor-tier.dto';
import { Event, EventStatus } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { EscrowService } from '../payments/services/escrow.service';
import { StellarService } from '../stellar/stellar.service';
import { AuditService } from '../audit/audit.service';
import { Role } from '../common/decorators/roles.decorator';

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
    private readonly eventsService: EventsService,
    private readonly contributionsService: ContributionsService,
    private readonly escrowService: EscrowService,
    private readonly stellarService: StellarService,
    private readonly auditService: AuditService,
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

    const txResponse = await this.stellarService.sendPayment(
      escrowSecret,
      organizer.stellarPublicKey,
      String(total),
      'XLM',
    );

    const txHash =
      typeof txResponse.hash === 'string' ? txResponse.hash : 'unknown';

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
}
