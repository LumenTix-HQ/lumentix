import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
  Headers,
  Res,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { CalendarService } from './calendar.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from '../events/entities/event.entity';
import { Registration } from '../registrations/entities/registration.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';

@ApiTags('Calendar')
@Controller()
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    @InjectRepository(Registration)
    private readonly registrationRepo: Repository<Registration>,
    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,
  ) {}

  @Get('events/:id/ical')
  @ApiOperation({
    summary: 'Download event as .ics file',
    description:
      'Returns an iCalendar (.ics) file for the specified event. No authentication required — usable by anyone.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  async downloadEventIcal(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const event = await this.eventRepo.findOne({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');

    const icsContent = this.calendarService.generateIcalFile({
      eventTitle: event.title,
      eventDescription: event.description ?? undefined,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
      location: event.location ?? undefined,
      uid: `event-${event.id}@lumentix`,
      url: `${this.getBaseUrl()}/events/${event.id}`,
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="event-${event.id}.ics"`,
    );
    return res.send(icsContent);
  }

  @Get('tickets/:id/ical')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Download personalized ticket .ics file',
    description:
      'Returns an iCalendar (.ics) file for the event associated with a ticket, personalized with attendee info. Requires authentication.',
  })
  @ApiParam({ name: 'id', description: 'Ticket UUID' })
  async downloadTicketIcal(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.ownerId !== req.user.id) throw new ForbiddenException('You do not own this ticket');

    const event = await this.eventRepo.findOne({ where: { id: ticket.eventId } });
    if (!event) throw new NotFoundException('Event not found');

    const icsContent = this.calendarService.generateIcalFile({
      eventTitle: event.title,
      eventDescription: `Your ticket: ${ticket.id}\n\n${event.description ?? ''}`,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
      location: event.location ?? undefined,
      uid: `ticket-${ticket.id}@lumentix`,
      attendeeEmail: (req.user as any).email ?? undefined,
      attendeeName: (req.user as any).displayName ?? (req.user as any).email ?? undefined,
      url: `${this.getBaseUrl()}/events/${event.id}`,
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ticket-${ticket.id}.ics"`,
    );
    return res.send(icsContent);
  }

  private getBaseUrl(): string {
    return process.env.API_BASE_URL ?? 'http://localhost:3001';
  }
}

