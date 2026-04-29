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
  Inject,
  forwardRef,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { DuplicateEventDto } from './dto/duplicate-event.dto';
import { EventStatsResponseDto } from './dto/event-stats-response.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { TicketsService } from '../tickets/tickets.service';
import { Event } from './entities/event.entity';

@ApiTags('Events')
@ApiBearerAuth()
@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: 429, description: 'Too Many Requests' })
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    @Inject(forwardRef(() => TicketsService))
    private readonly ticketsService: TicketsService,
  ) {}

  @Post()
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Create a new event', description: 'Organizer-only. Creates a DRAFT event.' })
  @ApiBody({
    type: CreateEventDto,
    examples: {
      conference: {
        summary: 'Conference',
        value: {
          title: 'Stellar Summit',
          startDate: '2025-09-01T09:00:00Z',
          endDate: '2025-09-02T18:00:00Z',
          ticketPrice: 50,
          currency: 'XLM',
          maxAttendees: 500,
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Event created', type: Event })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Not an organizer' })
  create(@Body() dto: CreateEventDto, @Req() req: AuthenticatedRequest) {
    return this.eventsService.createEvent(dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List all events', description: 'Supports filtering by status, date, category, and title search.' })
  @ApiResponse({ status: 200, description: 'List of events', type: [Event] })
  list(@Query() filterDto: ListEventsDto) {
    return this.eventsService.listEvents(filterDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an event by ID', description: 'Retrieves full details including soldTickets and remainingCapacity.' })
  @ApiResponse({ status: 200, description: 'Event found', type: Event })
  @ApiResponse({ status: 404, description: 'Event not found' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.getEventById(id);
  }

  @Put(':id')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Update an event', description: 'Organizer-only. Allows updating event details.' })
  @ApiResponse({ status: 200, description: 'Event updated', type: Event })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.updateEvent(id, dto, req.user.id);
  }

  @Delete(':id')
  @Roles(Role.ORGANIZER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an event', description: 'Organizer-only. Soft deletes an event if no tickets sold.' })
  @ApiResponse({ status: 204, description: 'Event deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.deleteEvent(id, req.user.id);
  }

  @Post(':id/publish')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Publish an event', description: 'Organizer-only. Transitions DRAFT → PUBLISHED and sets up escrow.' })
  @ApiResponse({ status: 201, description: 'Event published', type: Event })
  @ApiResponse({ status: 400, description: 'Invalid state transition' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.publishEvent(id, req.user.id);
  }

  @Post(':id/complete')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Complete an event', description: 'Organizer-only. Transitions PUBLISHED → COMPLETED. Only allowed after endDate.' })
  @ApiResponse({ status: 201, description: 'Event completed', type: Event })
  @ApiResponse({ status: 400, description: 'Event has not ended yet or invalid transition' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.completeEvent(id, req.user.id);
  }

  @Post(':id/cancel')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Cancel an event', description: 'Organizer-only. Cancels the event and automatically triggers refunds.' })
  @ApiResponse({ status: 201, description: 'Event cancelled' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.cancelEvent(id, req.user.id);
  }

  @Get(':id/stats')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Get event stats', description: 'Organizer-only. Returns revenue, ticket counts, sponsorship totals.' })
  @ApiResponse({ status: 200, description: 'Event stats', type: EventStatsResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  getStats(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.getEventStats(id, req.user.id);
  }

  @Get(':eventId/tickets')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Get event tickets', description: 'Organizer-only. Lists all tickets sold for the event.' })
  @ApiResponse({ status: 200, description: 'Tickets list' })
  async getEventTickets(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
    @Query() paginationDto: any,
  ) {
    return this.ticketsService.findByEvent(eventId, req.user.id, paginationDto);
  }

  @Get(':eventId/tickets/summary')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Get ticket summary', description: 'Organizer-only. Statistics on ticket sales.' })
  @ApiResponse({ status: 200, description: 'Ticket stats' })
  async getTicketSummary(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.ticketsService.getEventTicketSummary(eventId, req.user.id);
  }

  @Post(':id/duplicate')
  @Roles(Role.ORGANIZER)
  duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DuplicateEventDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.duplicateEvent(id, dto, req.user.id);
  }
}
