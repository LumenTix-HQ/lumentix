import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AuditService } from 'src/audit/audit.service';
import { AuditAction } from 'src/audit/entities/audit-log.entity';
import { StellarService } from 'src/stellar';
import {
  SponsorContribution,
  ContributionStatus,
} from './entities/sponsor-contribution.entity';
import { SponsorTier } from './entities/sponsor-tier.entity';
import { NotificationService } from 'src/notifications/notification.service';
import { User } from 'src/users/entities/user.entity';
import { Event } from 'src/events/entities/event.entity';
import { EventsService } from 'src/events/events.service';
import { PaginationDto, paginate } from 'src/common/pagination';

const SUPPORTED_ASSETS = ['XLM', 'USDC'] as const;
type SupportedAsset = (typeof SUPPORTED_ASSETS)[number];

export interface ContributionIntent {
  contributionId: string;
  escrowWallet: string;
  amount: number;
  currency: string;
  memo: string;
}

@Injectable()
export class ContributionsService {
  private readonly logger = new Logger(ContributionsService.name);
  private readonly escrowWallet: string;

  constructor(
    @InjectRepository(SponsorContribution)
    private readonly contributionRepository: Repository<SponsorContribution>,
    @InjectRepository(SponsorTier)
    private readonly tierRepository: Repository<SponsorTier>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private readonly stellarService: StellarService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    private readonly eventsService: EventsService,
    private readonly dataSource: DataSource,
  ) {
    this.escrowWallet =
      this.configService.get<string>('ESCROW_WALLET_PUBLIC_KEY') ?? '';

    if (!this.escrowWallet) {
      this.logger.warn('ESCROW_WALLET_PUBLIC_KEY is not set.');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1 — Create contribution intent
  // ─────────────────────────────────────────────────────────────────────────

  async createIntent(
    tierId: string,
    sponsorId: string,
  ): Promise<ContributionIntent> {
    const resolvedCurrency: SupportedAsset = 'XLM';

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let saved: SponsorContribution;
    let tierPrice: number;

    try {
      // Lock the tier row to prevent concurrent over-contribution
      const [tierRow] = await queryRunner.query(
        `SELECT t.id, t.price, t."maxSponsors",
                (SELECT COUNT(*) FROM sponsor_contributions c WHERE c."tierId" = t.id AND c.status = 'confirmed') AS confirmed_count
         FROM sponsor_tiers t WHERE t.id = $1 FOR UPDATE`,
        [tierId],
      );

      if (!tierRow) {
        throw new NotFoundException(`Sponsor tier "${tierId}" not found.`);
      }

      const confirmedCount = parseInt(tierRow.confirmed_count, 10);
      if (confirmedCount >= parseInt(tierRow.maxSponsors, 10)) {
        throw new ConflictException(
          `Sponsor tier is full (${tierRow.maxSponsors}/${tierRow.maxSponsors} spots taken).`,
        );
      }

      tierPrice = parseFloat(tierRow.price);

      const contribution = queryRunner.manager.create(SponsorContribution, {
        sponsorId,
        tierId,
        amount: tierPrice,
        transactionHash: null,
        status: ContributionStatus.PENDING,
      });
      saved = await queryRunner.manager.save(SponsorContribution, contribution);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    await this.auditService.log({
      action: AuditAction.PAYMENT_INTENT_CREATED,
      userId: sponsorId,
      resourceId: saved.id,
      meta: { tierId, amount: tierPrice!, currency: resolvedCurrency },
    });

    this.logger.log(
      `Contribution intent: id=${saved.id} tier=${tierId} sponsor=${sponsorId}`,
    );

    return {
      contributionId: saved.id,
      escrowWallet: this.escrowWallet,
      amount: tierPrice!,
      currency: resolvedCurrency,
      memo: saved.id,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2 — Confirm contribution
  // ─────────────────────────────────────────────────────────────────────────

  async confirmContribution(
    transactionHash: string,
  ): Promise<SponsorContribution> {
    // 1. Fetch tx via StellarService — no direct Horizon calls
    let txRecord: Awaited<ReturnType<StellarService['getTransaction']>>;
    try {
      txRecord = await this.stellarService.getTransaction(transactionHash);
    } catch {
      throw new BadRequestException(
        `Transaction "${transactionHash}" not found on the Stellar network.`,
      );
    }

    // 2. Correlate via memo
    const memoValue = this.stellarService.extractAndValidateMemo(txRecord);

    // 3. Lock the contribution row with SELECT FOR UPDATE to prevent
    //    two concurrent confirmations from both succeeding (race condition).
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let confirmed: SponsorContribution;

    try {
      const locked = await queryRunner.query(
        `SELECT c.*, t."eventId", t."maxSponsors", t."name" AS "tier_name"
         FROM sponsor_contributions c
         JOIN sponsor_tiers t ON t.id = c."tierId"
         WHERE c.id = $1 AND c.status = 'pending'
         FOR UPDATE OF c`,
        [memoValue],
      );

      if (!locked.length) {
        await queryRunner.rollbackTransaction();
        throw new NotFoundException(
          `No pending contribution found for memo "${memoValue}".`,
        );
      }

      const row = locked[0];

      // 4. Resolve operations
      const ops = await this.resolvePaymentOperations(txRecord);

      if (ops.length === 0) {
        await this.markFailedInTx(queryRunner, row.id, 'No payment operations in transaction.');
        await queryRunner.commitTransaction();
        throw new BadRequestException(
          'Transaction contains no payment operations.',
        );
      }

      // 5. Validate destination
      const matchingOp = ops.find((op) => op.to === this.escrowWallet);

      if (!matchingOp) {
        await this.markFailedInTx(
          queryRunner,
          row.id,
          `Incorrect destination. Expected ${this.escrowWallet}.`,
        );
        await queryRunner.commitTransaction();
        throw new BadRequestException(
          'Payment destination does not match the escrow wallet.',
        );
      }

      // 6. Validate asset type
      const assetCode: string =
        matchingOp.asset_type === 'native'
          ? 'XLM'
          : (matchingOp.asset_code ?? '');

      if (!SUPPORTED_ASSETS.includes(assetCode.toUpperCase() as SupportedAsset)) {
        await this.markFailedInTx(queryRunner, row.id, `Unsupported asset "${assetCode}".`);
        await queryRunner.commitTransaction();
        throw new BadRequestException(`Asset "${assetCode}" is not supported.`);
      }

      // 7. Validate amount matches tier price exactly
      const onChainAmount = parseFloat(matchingOp.amount);
      const expectedAmount = parseFloat(String(row.amount));

      if (Math.abs(onChainAmount - expectedAmount) > 0.0000001) {
        await this.markFailedInTx(
          queryRunner,
          row.id,
          `Incorrect amount. Expected ${expectedAmount}, got ${onChainAmount}.`,
        );
        await queryRunner.commitTransaction();
        throw new BadRequestException(
          `Incorrect contribution amount. Expected ${expectedAmount}, received ${onChainAmount}.`,
        );
      }

      // 8. Re-check capacity within the same locked transaction
      const confirmedCount = await queryRunner.query(
        `SELECT COUNT(*)::int AS cnt
         FROM sponsor_contributions
         WHERE "tierId" = $1 AND status = 'confirmed' AND id != $2`,
        [row.tierId, row.id],
      );
      const currentCount = confirmedCount[0]?.cnt ?? 0;
      if (currentCount >= row.maxSponsors) {
        await queryRunner.commitTransaction();
        throw new ConflictException(
          `Sponsor tier "${row.tier_name}" is full (${row.maxSponsors}/${row.maxSponsors} spots taken).`,
        );
      }

      // 9. Confirm while still holding the row lock
      await queryRunner.query(
        `UPDATE sponsor_contributions
         SET status = 'confirmed', "transactionHash" = $2
         WHERE id = $1`,
        [row.id, transactionHash],
      );

      await queryRunner.commitTransaction();

      confirmed = await this.contributionRepository.findOne({
        where: { id: row.id },
        relations: ['tier'],
      })!;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    await this.auditService.log({
      action: AuditAction.PAYMENT_CONFIRMED,
      userId: confirmed.sponsorId,
      resourceId: confirmed.id,
      meta: {
        transactionHash,
        tierId: confirmed.tierId,
        amount: confirmed.amount,
      },
    });

    this.logger.log(
      `Contribution confirmed: id=${confirmed.id} txHash=${transactionHash}`,
    );

    // 10. Queue sponsor confirmation email (non-blocking)
    this.queueSponsorConfirmedEmail(confirmed, transactionHash).catch(
      () => undefined,
    );

    return confirmed;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3 — List contributions for a tier (organizer only)
  // ─────────────────────────────────────────────────────────────────────────

  async listContributions(
    tierId: string,
    eventId: string,
    requesterId: string,
    dto: PaginationDto,
  ) {
    const tier = await this.tierRepository.findOne({
      where: { id: tierId, eventId },
    });
    if (!tier) throw new NotFoundException('Sponsor tier not found');

    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== requesterId) throw new ForbiddenException();

    const qb = this.contributionRepository
      .createQueryBuilder('c')
      .where('c.tierId = :tierId', { tierId });

    const [paginatedResult, tierTotal, contributorCount] = await Promise.all([
      paginate(qb, { ...dto, sortBy: 'createdAt', order: dto.order }, 'c'),
      this.contributionRepository
        .createQueryBuilder('c')
        .select('SUM(c.amount)', 'total')
        .where('c.tierId = :tierId AND c.status = :status', {
          tierId,
          status: ContributionStatus.CONFIRMED,
        })
        .getRawOne<{ total: string | null }>(),
      this.contributionRepository
        .createQueryBuilder('c')
        .select('COUNT(DISTINCT c.sponsorId)', 'count')
        .where('c.tierId = :tierId AND c.status = :status', {
          tierId,
          status: ContributionStatus.CONFIRMED,
        })
        .getRawOne<{ count: string | null }>(),
    ]);

    return {
      ...paginatedResult,
      tierTotal: Number(tierTotal?.total ?? 0),
      contributorCount: Number(contributorCount?.count ?? 0),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async queueSponsorConfirmedEmail(
    contribution: SponsorContribution,
    transactionHash: string,
  ): Promise<void> {
    const [sponsor, event] = await Promise.all([
      this.userRepository.findOne({ where: { id: contribution.sponsorId } }),
      this.eventRepository.findOne({
        where: { id: contribution.tier.eventId },
      }),
    ]);

    if (!sponsor || !event) return;

    await this.notificationService.queueSponsorConfirmedEmail({
      userId: sponsor.id,
      email: sponsor.email,
      sponsorName: sponsor.email,
      eventTitle: event.title,
      amount: Number(contribution.amount),
      currency: 'XLM',
      transactionHash,
    });
  }

  private async getTierById(id: string): Promise<SponsorTier> {
    const tier = await this.tierRepository.findOne({ where: { id } });
    if (!tier) {
      throw new NotFoundException(`Sponsor tier "${id}" not found.`);
    }
    return tier;
  }

  /**
   * Count confirmed contributions for a tier and throw if at capacity.
   * Pass `excludeId` to skip the current contribution when re-checking on confirm.
   */
  private async assertCapacityAvailable(
    tier: SponsorTier,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.contributionRepository
      .createQueryBuilder('c')
      .where('c.tierId = :tierId', { tierId: tier.id })
      .andWhere('c.status = :status', { status: ContributionStatus.CONFIRMED });

    if (excludeId) {
      qb.andWhere('c.id != :excludeId', { excludeId });
    }

    const confirmedCount = await qb.getCount();

    if (confirmedCount >= tier.maxSponsors) {
      throw new ConflictException(
        `Sponsor tier "${tier.name}" is full (${tier.maxSponsors}/${tier.maxSponsors} spots taken).`,
      );
    }
  }

  private async resolvePaymentOperations(
    txRecord: Awaited<ReturnType<StellarService['getTransaction']>>,
  ): Promise<PaymentOp[]> {
    try {
      const opsHref: string | undefined = txRecord._links.operations?.href;
      if (!opsHref) return [];

      const res = await fetch(opsHref);
      if (!res.ok) return [];

      const json = (await res.json()) as {
        _embedded: { records: PaymentOp[] };
      };
      return json._embedded.records.filter(
        (op) => op.type === 'payment' || op.type === 'create_account',
      );
    } catch {
      return [];
    }
  }

  private async markFailed(
    contribution: SponsorContribution,
    reason: string,
  ): Promise<void> {
    contribution.status = ContributionStatus.FAILED;
    await this.contributionRepository.save(contribution);

    await this.auditService.log({
      action: AuditAction.PAYMENT_FAILED,
      userId: contribution.sponsorId,
      resourceId: contribution.id,
      meta: { reason },
    });

    this.logger.warn(
      `Contribution failed: id=${contribution.id} reason=${reason}`,
    );
  }

  private async markFailedInTx(
    queryRunner: import('typeorm').QueryRunner,
    contributionId: string,
    reason: string,
  ): Promise<void> {
    await queryRunner.query(
      `UPDATE sponsor_contributions SET status = 'failed' WHERE id = $1`,
      [contributionId],
    );
  }
}

interface PaymentOp {
  type: string;
  to: string;
  amount: string;
  asset_type: string;
  asset_code?: string;
}
