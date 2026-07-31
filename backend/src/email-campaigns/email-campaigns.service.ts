import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { EmailCampaign, CampaignStatus } from './entities/email-campaign.entity';
import { EmailCampaignAnalytics } from './entities/email-campaign-analytics.entity';
import { CreateEmailCampaignDto } from './dto/create-email-campaign.dto';
import { UpdateEmailCampaignDto } from './dto/update-email-campaign.dto';
import { UpdateEmailAnalyticsDto } from './dto/update-email-analytics.dto';
import { TicketEntity } from '../tickets/entities/ticket.entity';

@Injectable()
export class EmailCampaignsService {
  private readonly logger = new Logger(EmailCampaignsService.name);

  constructor(
    @InjectRepository(EmailCampaign)
    private readonly campaignRepo: Repository<EmailCampaign>,
    @InjectRepository(EmailCampaignAnalytics)
    private readonly analyticsRepo: Repository<EmailCampaignAnalytics>,
    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,
    @InjectQueue('email-campaigns')
    private readonly campaignQueue: Queue,
  ) {}

  // ─── create_email_campaign ──────────────────────────────────────────────

  /**
   * Design a new email newsletter campaign.
   *
   * Collects the distinct past-attendee emails for the optional event filter
   * and stores the campaign in Draft status.  The campaign can then be
   * dispatched via `sendMarketingEmails`.
   */
  async createEmailCampaign(
    organizerId: string,
    dto: CreateEmailCampaignDto,
  ): Promise<EmailCampaign> {
    const recipientEmails = await this.resolveRecipients(organizerId, dto.eventId);
    if (recipientEmails.length === 0) {
      throw new BadRequestException(
        'No past attendees found for this organizer' +
          (dto.eventId ? ' / event' : '') +
          '. Cannot create campaign with zero recipients.',
      );
    }

    const campaign = this.campaignRepo.create({
      organizerId,
      eventId: dto.eventId ?? null,
      subject: dto.subject,
      bodyHtml: dto.bodyHtml,
      status: CampaignStatus.DRAFT,
      recipientCount: recipientEmails.length,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
    });

    const saved = await this.campaignRepo.save(campaign);

    // Seed analytics row
    const analytics = this.analyticsRepo.create({ campaignId: saved.id });
    await this.analyticsRepo.save(analytics);

    this.logger.log(
      `Campaign ${saved.id} created for organizer ${organizerId} ` +
        `(${recipientEmails.length} recipients)`,
    );

    return saved;
  }

  // ─── send_marketing_emails ──────────────────────────────────────────────

  /**
   * Dispatch a campaign: resolves recipients and enqueues one delivery job
   * per recipient via the Bull queue so failures are retried independently.
   *
   * Returns the updated campaign.
   */
  async sendMarketingEmails(
    organizerId: string,
    campaignId: string,
  ): Promise<EmailCampaign> {
    const campaign = await this.findOne(campaignId, organizerId);

    if (campaign.status === CampaignStatus.SENT) {
      throw new BadRequestException('Campaign has already been sent.');
    }
    if (campaign.status === CampaignStatus.CANCELLED) {
      throw new BadRequestException('Cannot send a cancelled campaign.');
    }

    const recipientEmails = await this.resolveRecipients(
      organizerId,
      campaign.eventId ?? undefined,
    );

    // Update status to SENDING
    campaign.status = CampaignStatus.SENDING;
    campaign.recipientCount = recipientEmails.length;
    await this.campaignRepo.save(campaign);

    // Enqueue individual delivery jobs
    for (const email of recipientEmails) {
      await this.campaignQueue.add(
        'deliverEmail',
        {
          campaignId: campaign.id,
          organizerId,
          to: email,
          subject: campaign.subject,
          bodyHtml: campaign.bodyHtml,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
        },
      );
    }

    // Mark as SENT and record timestamp
    campaign.status = CampaignStatus.SENT;
    campaign.sentAt = new Date();
    const saved = await this.campaignRepo.save(campaign);

    // Update analytics total_sent
    await this.analyticsRepo.update(
      { campaignId: campaign.id },
      { totalSent: recipientEmails.length },
    );

    this.logger.log(
      `Campaign ${campaign.id} dispatched to ${recipientEmails.length} recipients`,
    );

    return saved;
  }

  // ─── track_email_analytics ──────────────────────────────────────────────

  /**
   * Persist incoming delivery/engagement metrics for a campaign.
   *
   * This can be called repeatedly as the sending infrastructure reports back
   * delivery, open, and click events.
   */
  async trackEmailAnalytics(
    organizerId: string,
    campaignId: string,
    dto: UpdateEmailAnalyticsDto,
  ): Promise<EmailCampaignAnalytics> {
    const campaign = await this.findOne(campaignId, organizerId);

    // Prevent over-reporting
    if (
      dto.totalDelivered !== undefined &&
      dto.totalDelivered > campaign.recipientCount
    ) {
      throw new BadRequestException(
        `totalDelivered (${dto.totalDelivered}) exceeds recipientCount (${campaign.recipientCount}).`,
      );
    }

    const existing = await this.analyticsRepo.findOne({ where: { campaignId } });
    if (!existing) {
      throw new NotFoundException(`Analytics not found for campaign ${campaignId}`);
    }

    // Merge — only override provided fields
    if (dto.totalDelivered !== undefined) existing.totalDelivered = dto.totalDelivered;
    if (dto.totalOpened !== undefined) existing.totalOpened = dto.totalOpened;
    if (dto.totalClicked !== undefined) existing.totalClicked = dto.totalClicked;
    if (dto.totalBounced !== undefined) existing.totalBounced = dto.totalBounced;
    if (dto.totalUnsubscribed !== undefined) existing.totalUnsubscribed = dto.totalUnsubscribed;

    return this.analyticsRepo.save(existing);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  async findAllForOrganizer(organizerId: string): Promise<EmailCampaign[]> {
    return this.campaignRepo.find({
      where: { organizerId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(campaignId: string, organizerId?: string): Promise<EmailCampaign> {
    const campaign = await this.campaignRepo.findOne({ where: { id: campaignId } });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }
    if (organizerId && campaign.organizerId !== organizerId) {
      throw new ForbiddenException('You do not own this campaign.');
    }
    return campaign;
  }

  async getAnalytics(campaignId: string, organizerId: string): Promise<EmailCampaignAnalytics> {
    await this.findOne(campaignId, organizerId); // ownership check
    const analytics = await this.analyticsRepo.findOne({ where: { campaignId } });
    if (!analytics) {
      throw new NotFoundException(`Analytics not found for campaign ${campaignId}`);
    }
    return analytics;
  }

  async updateCampaign(
    campaignId: string,
    organizerId: string,
    dto: UpdateEmailCampaignDto,
  ): Promise<EmailCampaign> {
    const campaign = await this.findOne(campaignId, organizerId);
    if (campaign.status === CampaignStatus.SENT) {
      throw new BadRequestException('Cannot edit a campaign that has already been sent.');
    }
    if (dto.subject) campaign.subject = dto.subject;
    if (dto.bodyHtml) campaign.bodyHtml = dto.bodyHtml;
    if (dto.scheduledAt) campaign.scheduledAt = new Date(dto.scheduledAt);
    return this.campaignRepo.save(campaign);
  }

  async cancelCampaign(campaignId: string, organizerId: string): Promise<EmailCampaign> {
    const campaign = await this.findOne(campaignId, organizerId);
    if (campaign.status === CampaignStatus.SENT) {
      throw new BadRequestException('Cannot cancel a campaign that has already been sent.');
    }
    campaign.status = CampaignStatus.CANCELLED;
    return this.campaignRepo.save(campaign);
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  /**
   * Resolve the set of recipient email addresses for a campaign.
   *
   * - If `eventId` is provided: returns distinct emails of all ticket holders
   *   for that event whose organizer matches.
   * - If `eventId` is null/undefined: returns all distinct past-attendee emails
   *   across every event owned by the organizer.
   *
   * Note: User emails are fetched via a JOIN on the ticket → user relationship.
   * This is a best-effort query against the `tickets` table.
   */
  private async resolveRecipients(
    organizerId: string,
    eventId?: string,
  ): Promise<string[]> {
    const qb = this.ticketRepo
      .createQueryBuilder('ticket')
      .innerJoin('users', 'u', 'u.id = ticket.ownerId')
      .innerJoin('events', 'e', 'e.id = ticket.eventId')
      .select('DISTINCT u.email', 'email')
      .where('e.organizerId = :organizerId', { organizerId })
      .andWhere('ticket.status = :status', { status: 'valid' });

    if (eventId) {
      qb.andWhere('ticket.eventId = :eventId', { eventId });
    }

    const rows: { email: string }[] = await qb.getRawMany();
    return rows.map((r) => r.email).filter(Boolean);
  }
}
