import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { CreateAbTestVariantDto } from './dto/create-ab-test-variant.dto';
import { SplitAudienceDto } from './dto/split-audience.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Email Campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an email campaign', description: 'Organizer-only. Starts in draft status.' })
  @ApiResponse({ status: 201, description: 'Campaign created' })
  create(@Body() dto: CreateCampaignDto, @Req() req: AuthenticatedRequest) {
    return this.campaignsService.createCampaign(dto, req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a campaign by id' })
  @ApiResponse({ status: 200, description: 'Campaign returned' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.getCampaignById(id);
  }

  @Post(':id/variants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an A/B test variant', description: 'Organizer-only. Only allowed while the campaign is in draft.' })
  @ApiResponse({ status: 201, description: 'Variant created' })
  createVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAbTestVariantDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.campaignsService.createAbTestVariant(id, dto, req.user.id);
  }

  @Get(':id/variants')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List a campaign\'s variants' })
  @ApiResponse({ status: 200, description: 'List of variants' })
  listVariants(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.listVariants(id);
  }

  @Post(':id/split-audience')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Split the audience across variants and send', description: 'Organizer-only. Sends each recipient the subject/body of their assigned variant.' })
  @ApiResponse({ status: 201, description: 'Audience split and emails queued' })
  splitAudience(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SplitAudienceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.campaignsService.splitAudience(id, dto, req.user.id);
  }

  @Post(':id/select-winner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Select the winning variant', description: 'Organizer-only. Picks the variant with the best weighted open/click rate.' })
  @ApiResponse({ status: 200, description: 'Winning variant selected' })
  selectWinner(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.campaignsService.selectWinningVariant(id, req.user.id);
  }

  @Get('track/open/:recipientId')
  @ApiOperation({ summary: 'Record an email open', description: 'Public tracking endpoint, typically embedded as a pixel.' })
  @ApiResponse({ status: 200, description: 'Open recorded' })
  async trackOpen(@Param('recipientId', ParseUUIDPipe) recipientId: string) {
    await this.campaignsService.trackOpen(recipientId);
    return { recorded: true };
  }

  @Get('track/click/:recipientId')
  @ApiOperation({ summary: 'Record an email link click', description: 'Public tracking endpoint.' })
  @ApiResponse({ status: 200, description: 'Click recorded' })
  async trackClick(@Param('recipientId', ParseUUIDPipe) recipientId: string) {
    await this.campaignsService.trackClick(recipientId);
    return { recorded: true };
  }
}
