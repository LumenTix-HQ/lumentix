import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere } from 'typeorm';
import { Event, EventStatus } from './entities/event.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { EventStateService } from './state/event-state.service';
import { NotificationService } from '../notifications/notification.service';
import { User } from '../users/entities/user.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(TicketEntity)
    private readonly ticketRepository: Repository<TicketEntity>,
    private readonly eventStateService: EventStateService,
    private readonly notificationService: NotificationService,
  ) {}

  async createEvent(dto: CreateEventDto, organizerId: string): Promise<Event> {
    const event = this.eventRepository.create({
      ...dto,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      organizerId,
    });
    return this.eventRepository.save(event);
  }

  async updateEvent(
    id: string,
    dto: UpdateEventDto,
    callerId: string,
  ): Promise<Event> {
    const event = await this.getEventById(id);

    // ── Ownership check ────────────────────────────────────────────────────
    if (event.organizerId !== callerId) {
      throw new ForbiddenException('You are not the organiser of this event.');
    }

    if (dto.status !== undefined && dto.status !== event.status) {
      this.eventStateService.validateTransition(event.status, dto.status);
    }

    const previousStatus = event.status;

    const updates: Partial<Event> = {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.location !== undefined && { location: dto.location }),
      ...(dto.ticketPrice !== undefined && { ticketPrice: dto.ticketPrice }),
      ...(dto.currency !== undefined && { currency: dto.currency }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.startDate !== undefined && {
        startDate: new Date(dto.startDate),
      }),
      ...(dto.endDate !== undefined && { endDate: new Date(dto.endDate) }),
    };

    Object.assign(event, updates);
    const saved = await this.eventRepository.save(event);

    if (dto.status !== undefined && dto.status !== previousStatus) {
      this.queueLifecycleEmail(saved).catch(() => undefined);
    }

    return saved;
  }

  async deleteEvent(id: string, callerId: string): Promise<void> {
    const event = await this.getEventById(id);

    // ── Ownership check ────────────────────────────────────────────────────
    if (event.organizerId !== callerId) {
      throw new ForbiddenException('You are not the organiser of this event.');
    }

    await this.eventRepository.remove(event);
  }

  async getEventById(id: string): Promise<Event> {
    const event = await this.eventRepository.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException(`Event with id "${id}" not found`);
    }
    return event;
  }

  async listEvents(filterDto: ListEventsDto): Promise<PaginatedResult<Event>> {
    const { status, organizerId, search, page = 1, limit = 10 } = filterDto;

    const where: FindOptionsWhere<Event> = {
      ...(status && { status }),
      ...(organizerId && { organizerId }),
      ...(search && { title: Like(`%${search}%`) }),
    };

    const [data, total] = await this.eventRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async queueLifecycleEmail(event: Event): Promise<void> {
    if (event.status === EventStatus.CANCELLED) {
      const tickets = await this.ticketRepository.find({
        where: { eventId: event.id },
      });

      const ownerIds = [...new Set(tickets.map((t) => t.ownerId))];
      if (ownerIds.length === 0) return;

      const users = await this.userRepository.findByIds(ownerIds);
      const emails = users.map((u) => u.email).filter(Boolean);
      if (emails.length === 0) return;

      await this.notificationService.queueEventCancelledEmail({
        emails,
        eventTitle: event.title,
        refundInfo: 'A refund will be processed for eligible tickets.',
      });
    } else if (event.status === EventStatus.PUBLISHED) {
      const organizer = await this.userRepository.findOne({
        where: { id: event.organizerId },
      });
      if (!organizer) return;

      await this.notificationService.queueEventPublishedEmail({
        email: organizer.email,
        eventTitle: event.title,
      });
    } else if (event.status === EventStatus.COMPLETED) {
      const organizer = await this.userRepository.findOne({
        where: { id: event.organizerId },
      });
      if (!organizer) return;

      await this.notificationService.queueEventCompletedEmail({
        email: organizer.email,
        eventTitle: event.title,
      });
    }
  }
}
