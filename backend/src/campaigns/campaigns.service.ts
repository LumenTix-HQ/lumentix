import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailCampaign } from './entities/email-campaign.entity';
import { EmailCampaignVariant } from './entities/email-campaign-variant.entity';
import { EmailCampaignRecipient } from './entities/email-campaign-recipient.entity';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { CreateAbTestVariantDto } from './dto/create-ab-test-variant.dto';
import { SplitAudienceDto } from './dto/split-audience.dto';
import { UsersService } from '../users/users.service';
import { MailerService } from '../mailer/mailer.service';

export interface AudienceSplitResult {
  campaignId: string;
  totalRecipients: number;
  variantBreakdown: Array<{ variantId: string; label: string; recipients: number }>;
}

export interface WinningVariantResult {
  campaign: EmailCampaign;
  winner: EmailCampaignVariant;
  scores: Array<{
    variantId: string;
    label: string;
    openRate: number;
    clickRate: number;
    score: number;
  }>;
}

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(EmailCampaign)
    private readonly campaignRepository: Repository<EmailCampaign>,
    @InjectRepository(EmailCampaignVariant)
    private readonly variantRepository: Repository<EmailCampaignVariant>,
    @InjectRepository(EmailCampaignRecipient)
    private readonly recipientRepository: Repository<EmailCampaignRecipient>,
    private readonly usersService: UsersService,
    private readonly mailerService: MailerService,
  ) {}

  async createCampaign(dto: CreateCampaignDto, organizerId: string): Promise<EmailCampaign> {
    const campaign = this.campaignRepository.create({
      name: dto.name,
      eventId: dto.eventId ?? null,
      organizerId,
      status: 'draft',
    });
    return this.campaignRepository.save(campaign);
  }

  async createAbTestVariant(
    campaignId: string,
    dto: CreateAbTestVariantDto,
    requesterId: string,
  ): Promise<EmailCampaignVariant> {
    const campaign = await this.getCampaignById(campaignId);
    this.assertOwner(campaign, requesterId);

    if (campaign.status !== 'draft') {
      throw new BadRequestException('Variants can only be added while the campaign is in draft');
    }

    const variant = this.variantRepository.create({
      campaignId,
      label: dto.label,
      subject: dto.subject,
      body: dto.body,
    });
    return this.variantRepository.save(variant);
  }

  async listVariants(campaignId: string): Promise<EmailCampaignVariant[]> {
    return this.variantRepository.find({ where: { campaignId } });
  }

  async splitAudience(
    campaignId: string,
    dto: SplitAudienceDto,
    requesterId: string,
  ): Promise<AudienceSplitResult> {
    const campaign = await this.getCampaignById(campaignId);
    this.assertOwner(campaign, requesterId);

    if (campaign.status !== 'draft') {
      throw new BadRequestException('Audience has already been split for this campaign');
    }

    const variants = await this.variantRepository.find({ where: { campaignId } });
    if (variants.length < 2) {
      throw new BadRequestException('At least two variants are required to split an audience');
    }

    const weights = variants.map(
      (v) => dto.variantWeights?.[v.id] ?? 1,
    );
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (totalWeight <= 0) {
      throw new BadRequestException('Variant weights must sum to a positive number');
    }

    const cumulative: number[] = [];
    let runningTotal = 0;
    for (const w of weights) {
      runningTotal += w;
      cumulative.push(runningTotal);
    }

    const recipientCounts = new Map<string, number>(variants.map((v) => [v.id, 0]));
    const totalRecipients = dto.recipientUserIds.length;

    for (let i = 0; i < totalRecipients; i++) {
      const userId = dto.recipientUserIds[i];
      const position = (i / Math.max(totalRecipients, 1)) * totalWeight;
      const variantIndex = cumulative.findIndex((threshold) => position < threshold);
      const variant = variants[variantIndex === -1 ? variants.length - 1 : variantIndex];

      const user = await this.usersService.findById(userId).catch(() => null);
      if (!user) continue;

      const recipient = this.recipientRepository.create({
        campaignId,
        variantId: variant.id,
        userId,
      });
      await this.recipientRepository.save(recipient);

      await this.mailerService.queueEmail(
        user.email,
        variant.subject,
        { html: variant.body },
        { userId },
      );

      recipientCounts.set(variant.id, (recipientCounts.get(variant.id) ?? 0) + 1);
    }

    for (const variant of variants) {
      variant.sentCount += recipientCounts.get(variant.id) ?? 0;
    }
    await this.variantRepository.save(variants);

    campaign.status = 'testing';
    await this.campaignRepository.save(campaign);

    return {
      campaignId,
      totalRecipients,
      variantBreakdown: variants.map((v) => ({
        variantId: v.id,
        label: v.label,
        recipients: recipientCounts.get(v.id) ?? 0,
      })),
    };
  }

  async selectWinningVariant(
    campaignId: string,
    requesterId: string,
  ): Promise<WinningVariantResult> {
    const campaign = await this.getCampaignById(campaignId);
    this.assertOwner(campaign, requesterId);

    const variants = await this.variantRepository.find({ where: { campaignId } });
    if (variants.length === 0) {
      throw new BadRequestException('This campaign has no variants');
    }

    const scores = variants.map((v) => {
      const openRate = v.sentCount > 0 ? v.openCount / v.sentCount : 0;
      const clickRate = v.sentCount > 0 ? v.clickCount / v.sentCount : 0;
      const score = clickRate * 0.7 + openRate * 0.3;
      return { variantId: v.id, label: v.label, openRate, clickRate, score };
    });

    const bestScore = scores.reduce((best, s) => (s.score > best.score ? s : best), scores[0]);
    const winner = variants.find((v) => v.id === bestScore.variantId)!;

    campaign.winningVariantId = winner.id;
    campaign.status = 'completed';
    await this.campaignRepository.save(campaign);

    return { campaign, winner, scores };
  }

  async trackOpen(recipientId: string): Promise<void> {
    const recipient = await this.recipientRepository.findOne({ where: { id: recipientId } });
    if (!recipient || recipient.openedAt) return;

    recipient.openedAt = new Date();
    await this.recipientRepository.save(recipient);
    await this.variantRepository.increment({ id: recipient.variantId }, 'openCount', 1);
  }

  async trackClick(recipientId: string): Promise<void> {
    const recipient = await this.recipientRepository.findOne({ where: { id: recipientId } });
    if (!recipient || recipient.clickedAt) return;

    recipient.clickedAt = new Date();
    await this.recipientRepository.save(recipient);
    await this.variantRepository.increment({ id: recipient.variantId }, 'clickCount', 1);
  }

  async getCampaignById(id: string): Promise<EmailCampaign> {
    const campaign = await this.campaignRepository.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException(`Campaign "${id}" not found`);
    return campaign;
  }

  private assertOwner(campaign: EmailCampaign, requesterId: string): void {
    if (campaign.organizerId !== requesterId) {
      throw new ForbiddenException('Only the campaign owner can manage this campaign');
    }
  }
}
