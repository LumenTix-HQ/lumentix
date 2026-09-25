import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../admin/roles.guard';
import { Roles } from '../admin/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { SchedulingService } from './scheduling.service';
import { EventCategory } from '../events/entities/event.entity';
import {
  AnalyzeOptimalTimingDto,
  DetectScheduleConflictDto,
  PredictAttendanceImpactDto,
  ResolveConflictDto,
  SuggestAlternativeSlotsDto,
  SuggestEventScheduleDto,
} from './dto/scheduling.dto';

@ApiTags('Scheduling')
@ApiBearerAuth()
@Controller('scheduling')
@UseGuards(JwtAuthGuard)
@ApiResponse({ status: 401, description: 'Unauthorized' })
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  // ── Optimal timing & schedule suggestions ─────────────────────────────────

  @Post('analyze-optimal-timing')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Analyze optimal timing for an event (organizer / admin)',
    description:
      'Uses historical attendance, seasonal patterns, and competition data ' +
      'to recommend the best start/end dates for an event at a given location.',
  })
  @ApiResponse({ status: 201, description: 'Optimal timing analysis returned' })
  @ApiResponse({ status: 403, description: 'Organizer or admin role required' })
  async analyzeOptimalTiming(@Body() dto: AnalyzeOptimalTimingDto) {
    return this.schedulingService.analyzeOptimalTiming(
      dto.category,
      dto.location,
      dto.duration,
      dto.targetAudience,
    );
  }

  @Post('suggest-schedule')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get event schedule suggestions within a date range (organizer / admin)',
    description:
      'Returns up to 10 candidate time slots ranked by predicted attendance ' +
      'and revenue within the supplied date range.',
  })
  @ApiResponse({ status: 201, description: 'Schedule suggestions returned' })
  @ApiResponse({ status: 403, description: 'Organizer or admin role required' })
  async suggestEventSchedule(@Body() dto: SuggestEventScheduleDto) {
    return this.schedulingService.suggestEventSchedule(
      dto.category,
      dto.location,
      dto.duration,
      { start: new Date(dto.dateRange.start), end: new Date(dto.dateRange.end) },
    );
  }

  @Post('predict-attendance-impact/:eventId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Predict attendance impact of a schedule change (organizer / admin)',
    description:
      'Given new start and end dates, estimates the change in projected attendance ' +
      'relative to the event\'s historical baseline.',
  })
  @ApiParam({ name: 'eventId', format: 'uuid', description: 'Event to analyse' })
  @ApiResponse({ status: 201, description: 'Attendance impact prediction returned' })
  @ApiResponse({ status: 400, description: 'Event not found' })
  @ApiResponse({ status: 403, description: 'Organizer or admin role required' })
  async predictAttendanceImpact(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: PredictAttendanceImpactDto,
    @Req() _req: AuthenticatedRequest,
  ) {
    return this.schedulingService.predictAttendanceImpact(
      eventId,
      new Date(dto.newStartDate),
      new Date(dto.newEndDate),
    );
  }

  // ── Conflict detection ─────────────────────────────────────────────────────

  /**
   * POST /scheduling/detect-conflict
   *
   * Core `detect_schedule_conflict` function.
   *
   * Checks whether any PUBLISHED or COMPLETED event at the same venue
   * overlaps the requested time window. Touching boundaries (A ends at 18:00,
   * B starts at 18:00) are NOT considered conflicts.
   *
   * Pass `excludeEventId` when checking a reschedule so the event does not
   * clash with its own current booking.
   */
  @Post('detect-conflict')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'detect_schedule_conflict — check for venue booking overlaps',
    description:
      'Automatically detects scheduling conflicts when an organizer books or ' +
      'reschedules a time slot at a venue. ' +
      'Returns the full list of overlapping events, the exact overlapping window for each, ' +
      'and whether the overlap is partial or full. ' +
      'Only PUBLISHED and COMPLETED events are considered — DRAFT and CANCELLED bookings ' +
      'do not hold the venue.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Conflict report returned. Check `hasConflict` — if true, `conflicts[]` lists every clash.',
  })
  @ApiResponse({ status: 400, description: 'Invalid slot (endDate ≤ startDate, empty venue, etc.)' })
  @ApiResponse({ status: 403, description: 'Organizer or admin role required' })
  async detectScheduleConflict(@Body() dto: DetectScheduleConflictDto) {
    return this.schedulingService.detectScheduleConflict(
      dto.venue,
      new Date(dto.startDate),
      new Date(dto.endDate),
      dto.excludeEventId,
    );
  }

  /**
   * POST /scheduling/alternative-slots
   *
   * Core `suggest_alternative_slots` function.
   *
   * Walks outward from the requested slot in `stepHours` increments and
   * returns the first `limit` windows at which the venue is free.
   * Candidates alternate between forward and backward in time so the nearest
   * free slot — in either direction — is always listed first.
   */
  @Post('alternative-slots')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'suggest_alternative_slots — find free windows near a conflicted slot',
    description:
      'When a requested time slot is taken, this endpoint suggests nearby free windows ' +
      'at the same venue. Slots are returned in proximity order — the one requiring the ' +
      'smallest shift from the original request comes first. ' +
      'Only slots starting in the future are proposed. ' +
      'Tune `stepHours`, `searchWindowDays`, and `limit` to control the search.',
  })
  @ApiResponse({
    status: 201,
    description:
      'List of alternative slots returned, ordered by proximity to the requested slot. ' +
      'Each entry includes `startDate`, `endDate`, `shiftHours` (signed), and a human-readable `reason`.',
  })
  @ApiResponse({ status: 400, description: 'Invalid parameters (limit/stepHours/searchWindowDays ≤ 0)' })
  @ApiResponse({ status: 403, description: 'Organizer or admin role required' })
  async suggestAlternativeSlots(@Body() dto: SuggestAlternativeSlotsDto) {
    return this.schedulingService.suggestAlternativeSlots(
      dto.venue,
      new Date(dto.startDate),
      new Date(dto.endDate),
      {
        limit: dto.limit,
        stepHours: dto.stepHours,
        searchWindowDays: dto.searchWindowDays,
        excludeEventId: dto.excludeEventId,
      },
    );
  }

  /**
   * POST /scheduling/resolve-conflict
   *
   * Core `resolve_conflict` function — detect + suggest in one call.
   *
   * Returns one of three outcomes:
   *  - `no_conflict`           — the slot is free; nothing to do.
   *  - `alternative_available` — conflicts found; `recommendedSlot` has the nearest free window.
   *  - `unresolved`            — conflicts found but no free slot in the search window.
   *
   * This endpoint is read-only: it produces a plan but never moves or
   * cancels any existing booking.
   */
  @Post('resolve-conflict')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'resolve_conflict — detect conflicts and recommend the nearest free slot',
    description:
      'Combined detect + suggest in a single call. ' +
      'If the venue is free the response is `{ outcome: "no_conflict" }`. ' +
      'If it is taken, `recommendedSlot` points to the nearest free window ' +
      'and `alternatives` lists all free slots found. ' +
      'The `reasoning` array explains each conflict and the recommended shift. ' +
      'No bookings are moved — this is a planning tool only.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Resolution returned. Check `outcome`: ' +
      '`no_conflict` | `alternative_available` | `unresolved`.',
  })
  @ApiResponse({ status: 400, description: 'Invalid slot parameters' })
  @ApiResponse({ status: 403, description: 'Organizer or admin role required' })
  async resolveConflict(@Body() dto: ResolveConflictDto) {
    return this.schedulingService.resolveConflict(
      dto.venue,
      new Date(dto.startDate),
      new Date(dto.endDate),
      {
        limit: dto.limit,
        stepHours: dto.stepHours,
        searchWindowDays: dto.searchWindowDays,
        excludeEventId: dto.excludeEventId,
      },
    );
  }

  // ── Convenience read endpoints ─────────────────────────────────────────────

  /**
   * GET /scheduling/venue-bookings
   *
   * Quick view of all PUBLISHED / COMPLETED bookings at a venue within a
   * date window. Useful for rendering a venue calendar before submitting a
   * `detect-conflict` request.
   */
  @Get('venue-bookings')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'List confirmed bookings at a venue (organizer / admin)',
    description:
      'Returns every PUBLISHED or COMPLETED event at the given venue ' +
      'that overlaps the specified date window. ' +
      'Use this to inspect a venue calendar before checking for conflicts.',
  })
  @ApiQuery({ name: 'venue', description: 'Venue / location string', example: 'Moscone Center' })
  @ApiQuery({ name: 'from', description: 'ISO 8601 window start', example: '2026-10-01T00:00:00Z' })
  @ApiQuery({ name: 'to', description: 'ISO 8601 window end', example: '2026-10-31T23:59:59Z' })
  @ApiResponse({ status: 200, description: 'Bookings returned' })
  @ApiResponse({ status: 403, description: 'Organizer or admin role required' })
  async getVenueBookings(
    @Query('venue') venue: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    // Reuse detectScheduleConflict with a span covering the full window so we
    // can piggy-back on the same overlap query — pass a dummy 1-ms slot that
    // spans the entire requested window.
    const startDate = new Date(from);
    const endDate = new Date(to);
    const report = await this.schedulingService.detectScheduleConflict(
      venue,
      startDate,
      endDate,
    );
    return {
      venue: report.venue,
      venueRecord: report.venueRecord,
      window: { from: startDate, to: endDate },
      bookings: report.conflicts.map((c) => ({
        eventId: c.eventId,
        title: c.title,
        organizerId: c.organizerId,
        startDate: c.startDate,
        endDate: c.endDate,
      })),
      total: report.conflicts.length,
    };
  }

  // ── Legacy insight endpoints (unchanged behaviour) ─────────────────────────

  @Get('seasonal-insights')
  @ApiOperation({ summary: 'Get seasonal insights for event categories' })
  @ApiQuery({ name: 'category', enum: EventCategory })
  @ApiQuery({ name: 'location', example: 'Lagos, Nigeria' })
  @ApiResponse({ status: 200, description: 'Seasonal insights returned' })
  async getSeasonalInsights(
    @Query('category') category: EventCategory,
    @Query('location') location: string,
  ) {
    return {
      category,
      location,
      insights: [
        'Summer months show 40% higher attendance for outdoor events',
        'December has lowest attendance due to holiday competition',
        'Weekend events perform 60% better than weekdays',
      ],
    };
  }

  @Get('competition-analysis')
  @ApiOperation({ summary: 'Analyse competition for a specific time period' })
  @ApiQuery({ name: 'category', enum: EventCategory })
  @ApiQuery({ name: 'location', example: 'Lagos, Nigeria' })
  @ApiQuery({ name: 'startDate', example: '2026-10-01T00:00:00Z' })
  @ApiQuery({ name: 'endDate', example: '2026-10-31T23:59:59Z' })
  @ApiResponse({ status: 200, description: 'Competition analysis returned' })
  async analyzeCompetition(
    @Query('category') category: EventCategory,
    @Query('location') location: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return {
      timeRange: { startDate, endDate },
      competingEvents: 3,
      competitionLevel: 'medium',
      recommendations: [
        'Consider moving to the following week for lower competition',
        'Current slot has moderate competition from similar events',
      ],
    };
  }
}
