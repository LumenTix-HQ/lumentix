import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { VipService } from './vip.service';
import { CreateVipTierDto } from './dto/create-vip-tier.dto';
import { UpdateVipTierDto } from './dto/update-vip-tier.dto';
import { AssignVipBenefitsDto } from './dto/assign-vip-benefits.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('VIP Tiers')
@Controller('events/:eventId/vip-tiers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VipController {
  constructor(private readonly vipService: VipService) {}

  @Post()
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create VIP tier', description: 'Organizer-only. Creates a new VIP tier with benefits.' })
  @ApiResponse({ status: 201, description: 'VIP tier created' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateVipTierDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.vipService.createTier(eventId, dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List VIP tiers', description: 'Public. Shows available VIP tiers for an event.' })
  @ApiResponse({ status: 200, description: 'List of VIP tiers' })
  list(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.vipService.listTiers(eventId);
  }

  @Put(':id')
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update VIP tier', description: 'Organizer-only. Updates tier details.' })
  @ApiResponse({ status: 200, description: 'VIP tier updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVipTierDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.vipService.updateTier(id, dto, req.user.id);
  }

  @Delete(':id')
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete VIP tier', description: 'Organizer-only. Removes a VIP tier.' })
  @ApiResponse({ status: 204, description: 'VIP tier deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.vipService.deleteTier(id, req.user.id);
  }

  @Post('assign')
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign VIP benefits to ticket', description: 'Organizer-only. Assigns a ticket to a VIP tier.' })
  @ApiResponse({ status: 201, description: 'VIP benefits assigned' })
  @ApiResponse({ status: 400, description: 'Tier full or invalid ticket' })
  assign(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: AssignVipBenefitsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.vipService.assignBenefits(dto.tierId, dto.ticketId, req.user.id);
  }

  @Get('validate/:ticketId/:tierName')
  @ApiOperation({ summary: 'Validate VIP access', description: 'Check if a ticket has access to a specific VIP tier.' })
  @ApiResponse({ status: 200, description: 'Access validation result' })
  validateAccess(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('tierName') tierName: string,
  ) {
    return this.vipService.validateAccess(ticketId, tierName);
  }
}
