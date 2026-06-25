import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
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
  ApiParam,
  ApiResponse,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { DuplicateEventDto } from './dto/duplicate-event.dto';
import { CreateEventSeriesDto } from './dto/create-event-series.dto';
import { UpdateEventSeriesDto } from './dto/update-event-series.dto';
import { BulkUpdateSeriesDto } from './dto/bulk-update-series.dto';
import { EventStatsResponseDto } from './dto/event-stats-response.dto';
import { AddEventImageDto } from './dto/add-event-image.dto';
import { UpdateImageOrderDto } from './dto/update-image-order.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { TicketsService } from '../tickets/tickets.service';
import { WebhooksService } from '../webhooks/webhooks.service';
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
    private readonly webhooksService: WebhooksService,
  ) {}

  @Post()
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Create a new event' })
  @ApiResponse({ status: 201, description: 'Event created', type: Event })
  create(@Body() dto: CreateEventDto, @Req() req: AuthenticatedRequest) {
    return this.eventsService.createEvent(dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List all events' })
  list(@Query() filterDto: ListEventsDto) {
    return this.eventsService.listEvents(filterDto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an event by ID',
    description:
      'Retrieves full details including soldTickets and availableSpots.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Event found', type: Event })
  @ApiResponse({ status: 404, description: 'Event not found' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.getEventById(id);
  }

  @Put(':id')
  @Roles(Role.ORGANIZER)
  @ApiOperation({
    summary: 'Update an event',
    description: 'Organizer-only. Allows updating event details.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiBody({ type: UpdateEventDto })
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

  @Patch(':id')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Patch an event' })
  patch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.updateEvent(id, dto, req.user.id);
  }

  @Patch(':id/capacity')
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update event capacity',
    description: 'Organizer only. Updates the max attendee cap. Returns 409 if reduction would go below sold ticket count.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        maxAttendees: {
          type: 'integer',
          nullable: true,
          description: 'New max attendee count. Pass null for unlimited.',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Capacity updated' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the organizer' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @ApiResponse({ status: 409, description: 'Conflict — reduction below sold count' })
  updateCapacity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('maxAttendees') maxAttendees: number | null,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.updateCapacity(id, req.user.id, maxAttendees ?? null);
  }

  // ── Image upload ────────────────────────────────────────────────────────

  @Post(':id/image')
  @Roles(Role.ORGANIZER)
  @UseInterceptors(FileInterceptor('image'))
  @ApiOperation({ summary: 'Upload event image (JPEG/PNG, max 5MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Event image file (JPEG/PNG, max 5MB)',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Image uploaded' })
  @ApiResponse({ status: 400, description: 'Invalid file' })
  async uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
  ) {
    const { url } = await this.storageService.upload(file, `events/${id}`);
    return this.eventsService.updateEventImage(id, url, req.user.id);
  }

  @Post(':id/emergency')
  @Roles(Role.ORGANIZER)
  triggerEmergency(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: {
      protocol?: string;
      message?: string;
      emergencyServicesContact?: string;
    },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.trigger_emergency_protocol(id, req.user.id, body);
  }

  @Get(':id/evacuation')
  @Roles(Role.ORGANIZER)
  trackEvacuation(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.track_evacuation_status(id, req.user.id);
  }

  @Post(':id/weather/monitor')
  @Roles(Role.ORGANIZER)
  monitorWeather(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.monitor_weather_conditions(id, req.user.id);
  }

  @Post(':id/reschedule')
  @Roles(Role.ORGANIZER)
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { startDate: string; endDate: string; reason?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.reschedule_event(id, req.user.id, body);
  }

  @Delete(':id')
  @Roles(Role.ORGANIZER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an event',
    description: 'Organizer-only. Soft deletes an event if no tickets sold.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
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
  @ApiOperation({
    summary: 'Publish an event',
    description:
      'Organizer-only. Transitions DRAFT → PUBLISHED and sets up escrow.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
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
  @ApiOperation({
    summary: 'Complete an event',
    description:
      'Organizer-only. Transitions PUBLISHED → COMPLETED. Only allowed after endDate.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({ status: 201, description: 'Event completed', type: Event })
  @ApiResponse({
    status: 400,
    description: 'Event has not ended yet or invalid transition',
  })
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
  @ApiOperation({
    summary: 'Cancel an event',
    description:
      'Organizer-only. Cancels the event and automatically triggers refunds.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
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
  @ApiOperation({
    summary: 'Get event stats',
    description:
      'Organizer-only. Returns revenue, ticket counts, sponsorship totals.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({
    status: 200,
    description: 'Event stats',
    type: EventStatsResponseDto,
  })
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
  async getEventTickets(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
    @Query() paginationDto: any,
  ) {
    return this.ticketsService.findByEvent(eventId, req.user.id, paginationDto);
  }

  @Get(':eventId/tickets/summary')
  @Roles(Role.ORGANIZER)
  async getTicketSummary(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.ticketsService.getEventTicketSummary(eventId, req.user.id);
  }

  @Post('series')
  @Roles(Role.ORGANIZER)
  @ApiOperation({
    summary: 'Create a recurring event series',
    description: 'Organizer-only. Creates a series and child events.',
  })
  createSeries(
    @Body() dto: CreateEventSeriesDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.create_event_series(dto, req.user.id);
  }

  @Put('series/:seriesId/settings')
  @Roles(Role.ORGANIZER)
  @ApiOperation({
    summary: 'Manage settings for a series',
    description: 'Organizer-only. Propagates settings to all events in the series.',
  })
  manageSeriesSettings(
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
    @Body() dto: UpdateEventSeriesDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.manage_series_settings(seriesId, dto, req.user.id);
  }

  @Patch('series/:seriesId/bulk')
  @Roles(Role.ORGANIZER)
  @ApiOperation({
    summary: 'Bulk update events in a series',
    description: 'Organizer-only. Updates status/price in bulk.',
  })
  bulkUpdateSeries(
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
    @Body() dto: BulkUpdateSeriesDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.bulk_update_series(seriesId, dto, req.user.id);
  }

  @Post(':id/duplicate')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Duplicate an event', description: 'Organizer-only. Creates a DRAFT copy of an existing event.' })
  @ApiParam({ name: 'id', description: 'Event UUID to duplicate' })
  @ApiBody({ type: DuplicateEventDto })
  @ApiResponse({ status: 201, description: 'Event duplicated', type: Event })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DuplicateEventDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.duplicateEvent(id, dto, req.user.id);
  }

  @Post(':id/images')
  @Roles(Role.ORGANIZER)
  addImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddEventImageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.addEventImage(id, req.user.id, dto);
  }

  @Patch(':id/images/order')
  @Roles(Role.ORGANIZER)
  updateImageOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateImageOrderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.updateImageOrder(id, req.user.id, dto);
  }

  @Delete(':id/images/:imageId')
  @Roles(Role.ORGANIZER)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.deleteEventImage(id, imageId, req.user.id);

  @Get(':id/webhooks/deliveries')
  @Roles(Role.ORGANIZER)
  @ApiOperation({
    summary: 'Get webhook delivery history',
    description: 'Organizer-only. Returns the last 50 outbound webhook deliveries for this event.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Webhook delivery records' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getWebhookDeliveries(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const event = await this.eventsService.getEventById(id);
    if (event.organizerId !== req.user.id) {
      throw new ForbiddenException();
    }
    return this.webhooksService.getDeliveries(id);
  }
}
