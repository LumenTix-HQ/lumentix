import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
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
}
