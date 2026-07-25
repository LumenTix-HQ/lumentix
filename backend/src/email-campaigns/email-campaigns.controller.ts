import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { EmailCampaignsService } from './email-campaigns.service';
import { CreateEmailCampaignDto } from './dto/create-email-campaign.dto';
import { UpdateEmailCampaignDto } from './dto/update-email-campaign.dto';
import { UpdateEmailAnalyticsDto } from './dto/update-email-analytics.dto';

@ApiTags('Email Campaigns')
@ApiBearerAuth()
@Controller('email-campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: 429, description: 'Too Many Requests' })
export class EmailCampaignsController {
  constructor(private readonly emailCampaignsService: EmailCampaignsService) {}

  // ─── create_email_campaign ───────────────────────────────────────────────

  /**
   * Design and save a new email newsletter campaign.
   *
   * Automatically resolves the recipient list from past event attendees.
   * Returns the campaign in DRAFT status ready for review and dispatch.
   */
  @Post()
  @Roles(Role.ORGANIZER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new email newsletter campaign' })
  @ApiResponse({ status: 201, description: 'Campaign created in DRAFT status.' })
  @ApiResponse({ status: 400, description: 'No recipients or invalid payload.' })
  async createEmailCampaign(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateEmailCampaignDto,
  ) {
    return this.emailCampaignsService.createEmailCampaign(req.user.id, dto);
  }

  // ─── send_marketing_emails ───────────────────────────────────────────────

  /**
   * Dispatch the campaign: resolves attendee emails and enqueues delivery.
   *
   * The campaign transitions DRAFT → SENDING → SENT.
   * Idempotent for SENT campaigns — returns 400 if already sent.
   */
  @Post(':id/send')
  @Roles(Role.ORGANIZER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dispatch marketing emails for a campaign' })
  @ApiParam({ name: 'id', description: 'Campaign UUID' })
  @ApiResponse({ status: 200, description: 'Campaign sent successfully.' })
  @ApiResponse({ status: 400, description: 'Campaign already sent or cancelled.' })
  @ApiResponse({ status: 403, description: 'Not the campaign owner.' })
  async sendMarketingEmails(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.emailCampaignsService.sendMarketingEmails(req.user.id, id);
  }

  // ─── track_email_analytics ───────────────────────────────────────────────

  /**
   * Update delivery and engagement analytics for a campaign.
   *
   * Called by the sending infrastructure (or webhook) as delivery events
   * (delivered, opened, clicked, bounced, unsubscribed) are received.
   */
  @Patch(':id/analytics')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Update email delivery/engagement analytics' })
  @ApiParam({ name: 'id', description: 'Campaign UUID' })
  @ApiResponse({ status: 200, description: 'Analytics updated.' })
  @ApiResponse({ status: 400, description: 'Invalid analytics values.' })
  @ApiResponse({ status: 403, description: 'Not the campaign owner.' })
  async trackEmailAnalytics(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmailAnalyticsDto,
  ) {
    return this.emailCampaignsService.trackEmailAnalytics(req.user.id, id, dto);
  }

  // ─── Read endpoints ─────────────────────────────────────────────────────

  @Get()
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'List all campaigns for the authenticated organizer' })
  async listCampaigns(@Req() req: AuthenticatedRequest) {
    return this.emailCampaignsService.findAllForOrganizer(req.user.id);
  }

  @Get(':id')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Get campaign details' })
  @ApiParam({ name: 'id', description: 'Campaign UUID' })
  async getCampaign(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.emailCampaignsService.findOne(id, req.user.id);
  }

  @Get(':id/analytics')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Get analytics for a campaign' })
  @ApiParam({ name: 'id', description: 'Campaign UUID' })
  async getAnalytics(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.emailCampaignsService.getAnalytics(id, req.user.id);
  }

  @Patch(':id')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Update a DRAFT campaign' })
  @ApiParam({ name: 'id', description: 'Campaign UUID' })
  async updateCampaign(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmailCampaignDto,
  ) {
    return this.emailCampaignsService.updateCampaign(id, req.user.id, dto);
  }

  @Delete(':id')
  @Roles(Role.ORGANIZER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a campaign (only DRAFT/SCHEDULED)' })
  @ApiParam({ name: 'id', description: 'Campaign UUID' })
  async cancelCampaign(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.emailCampaignsService.cancelCampaign(id, req.user.id);
  }
}
