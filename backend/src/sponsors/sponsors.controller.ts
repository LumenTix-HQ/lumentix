import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { SponsorsService } from './sponsors.service';
import { ContributionsService } from './contributions.service';
import { CreateSponsorTierDto } from './dto/create-sponsor-tier.dto';
import { UpdateSponsorTierDto } from './dto/update-sponsor-tier.dto';
import { ContributionIntentDto } from './dto/contribution-intent.dto';
import { ConfirmContributionDto } from './dto/confirm-contribution.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { PaginationDto } from '../common/pagination';

@ApiTags('Sponsors')
@Controller('events/:eventId/tiers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SponsorsController {
  constructor(
    private readonly sponsorsService: SponsorsService,
    private readonly contributionsService: ContributionsService,
  ) {}

  // ── Tier management (organizer only) ─────────────────────────────────────

  @Post()
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create sponsor tier', description: 'Organizer-only. Creates a new sponsorship tier for an event.' })
  @ApiResponse({ status: 201, description: 'Tier created' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateSponsorTierDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.sponsorsService.createTier(eventId, dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List sponsor tiers', description: 'Public. Shows available sponsorship tiers for an event.' })
  @ApiResponse({ status: 200, description: 'List of tiers' })
  list(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.sponsorsService.listTiers(eventId);
  }

  @Get('progress')
  @ApiOperation({
    summary: 'Get sponsorship funding progress',
    description: 'Public. Returns raised amount, goal, percentage, and contributor count for an event.',
  })
  @ApiResponse({ status: 200, description: 'Funding progress' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  getFundingProgress(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.sponsorsService.getFundingProgress(eventId);
  }

  @Put(':id')
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update sponsor tier', description: 'Organizer-only. Updates tier details.' })
  @ApiResponse({ status: 200, description: 'Tier updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSponsorTierDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.sponsorsService.updateTier(id, dto, req.user.id);
  }

  @Delete(':id')
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete sponsor tier', description: 'Organizer-only. Removes a tier if no contributions exist.' })
  @ApiResponse({ status: 204, description: 'Tier deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.sponsorsService.deleteTier(id, req.user.id);
  }

  // ── Contribution flow (sponsor) ───────────────────────────────────────────

  @Post('contribute/intent')
  @Roles(Role.SPONSOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create contribution intent', description: 'Sponsor selects a tier and receives the escrow wallet.' })
  @ApiResponse({ status: 201, description: 'Intent created' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  createIntent(
    @Body() dto: ContributionIntentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.contributionsService.createIntent(dto.tierId, req.user.id);
  }

  @Post('contribute/confirm')
  @Roles(Role.SPONSOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm contribution', description: 'Sponsor submits the on-chain transaction hash.' })
  @ApiResponse({ status: 200, description: 'Contribution confirmed' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  confirmContribution(@Body() dto: ConfirmContributionDto) {
    return this.contributionsService.confirmContribution(dto.transactionHash);
  }

  @Get(':id/contributions')
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List contributions for a sponsor tier',
    description: 'Organizer-only. Returns paginated contributions with tier totals.',
  })
  @ApiResponse({ status: 200, description: 'Paginated contributions with tierTotal and contributorCount' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Tier not found' })
  listContributions(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('id', ParseUUIDPipe) tierId: string,
    @Query() paginationDto: PaginationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.contributionsService.listContributions(
      tierId,
      eventId,
      req.user.id,
      paginationDto,
    );
  }

  // ── Escrow distribution (organizer / admin) ───────────────────────────────

  @Post('distribute')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Distribute escrow to organizer', description: 'Releases sponsor funds from escrow to the organizer Stellar wallet. Event must be COMPLETED.' })
  @ApiResponse({ status: 201, description: 'Funds distributed' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  distributeEscrow(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.sponsorsService.distributeEscrow(eventId, req.user.id, req.user.role);
  }
}
