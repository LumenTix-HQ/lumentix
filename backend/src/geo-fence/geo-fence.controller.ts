import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { GeoFenceService } from './geo-fence.service';
import { SetGeoFenceRulesDto } from './dto/set-geo-fence-rules.dto';
import { ValidateBuyerLocationDto } from './dto/validate-buyer-location.dto';
import { GeoFenceRuleResponseDto } from './dto/geo-fence-rule-response.dto';
import { GeoFenceValidationResultDto } from './dto/geo-fence-validation-result.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Geo-Fence')
@ApiBearerAuth()
@Controller('geo-fence')
export class GeoFenceController {
  constructor(private readonly geoFenceService: GeoFenceService) {}

  // ── Organizer: manage rules ──────────────────────────────────────────────

  /**
   * POST /geo-fence/events/:eventId/rules
   *
   * set_geo_fence_rules — Replaces the full set of geo-fence rules for an
   * event. Passing an empty `rules` array removes all restrictions.
   */
  @Post('events/:eventId/rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  @ApiOperation({
    summary: 'Set geo-fence rules for an event',
    description:
      'Organizer-only. Atomically replaces all geo-fence rules for the event. ' +
      'Pass an empty array to remove all restrictions.',
  })
  @ApiParam({ name: 'eventId', description: 'UUID of the event', type: String })
  @ApiBody({ type: SetGeoFenceRulesDto })
  @ApiResponse({
    status: 201,
    description: 'Rules replaced successfully — returns the full saved rule set.',
    type: [GeoFenceRuleResponseDto],
  })
  @ApiResponse({ status: 400, description: 'Validation error in rule config' })
  @ApiResponse({ status: 403, description: 'Caller is not the event organizer' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async setGeoFenceRules(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: SetGeoFenceRulesDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<GeoFenceRuleResponseDto[]> {
    return this.geoFenceService.setGeoFenceRules(eventId, req.user.id, dto);
  }

  /**
   * GET /geo-fence/events/:eventId/rules
   *
   * Returns all geo-fence rules for an event (enabled and disabled).
   * Accessible to any authenticated user so clients can preview restrictions
   * before attempting a purchase.
   */
  @Get('events/:eventId/rules')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'List geo-fence rules for an event',
    description:
      'Returns all configured geo-fence rules (enabled and disabled). ' +
      'Available to any authenticated user.',
  })
  @ApiParam({ name: 'eventId', description: 'UUID of the event', type: String })
  @ApiResponse({
    status: 200,
    description: 'List of geo-fence rules',
    type: [GeoFenceRuleResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getRules(
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<GeoFenceRuleResponseDto[]> {
    return this.geoFenceService.getRulesForEvent(eventId);
  }

  /**
   * DELETE /geo-fence/events/:eventId/rules
   *
   * Removes all geo-fence rules for an event (equivalent to calling
   * set_geo_fence_rules with an empty array).
   */
  @Delete('events/:eventId/rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove all geo-fence rules for an event',
    description: 'Organizer-only. Deletes every geo-fence rule attached to the event.',
  })
  @ApiParam({ name: 'eventId', description: 'UUID of the event', type: String })
  @ApiResponse({ status: 204, description: 'Rules deleted' })
  @ApiResponse({ status: 403, description: 'Caller is not the event organizer' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async deleteRules(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.geoFenceService.deleteRulesForEvent(eventId, req.user.id);
  }

  // ── Buyer: validate location before purchase ─────────────────────────────

  /**
   * POST /geo-fence/events/:eventId/validate-location
   *
   * validate_buyer_location — Evaluates the caller's supplied location data
   * against all enabled geo-fence rules for the event and returns an
   * allow/deny decision with per-rule detail.
   *
   * This is a dry-run check; it does NOT block a purchase by itself.
   * The hard enforcement happens inside the ticket-issuance flow via
   * enforce_geo_restriction.
   */
  @Post('events/:eventId/validate-location')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Validate buyer location against geo-fence rules',
    description:
      'Evaluates the buyer's GPS coordinates and/or country code against all ' +
      'enabled rules for the event. Returns an allow/deny decision with per-rule detail. ' +
      'Use this as a pre-purchase check on the client side.',
  })
  @ApiParam({ name: 'eventId', description: 'UUID of the event', type: String })
  @ApiBody({ type: ValidateBuyerLocationDto })
  @ApiResponse({
    status: 200,
    description: 'Validation result',
    type: GeoFenceValidationResultDto,
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async validateLocation(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: ValidateBuyerLocationDto,
  ): Promise<GeoFenceValidationResultDto> {
    return this.geoFenceService.validateBuyerLocation(eventId, dto);
  }
}
