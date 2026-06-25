import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, In } from 'typeorm';
import { Event, EventStatus, EventCategory, EventAgeRestriction } from './entities/event.entity';
import { EventSeries } from './entities/event-series.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { DuplicateEventDto } from './dto/duplicate-event.dto';
import { CreateEventSeriesDto } from './dto/create-event-series.dto';
import { UpdateEventSeriesDto } from './dto/update-event-series.dto';
import { BulkUpdateSeriesDto } from './dto/bulk-update-series.dto';
import { EventStatsResponseDto } from './dto/event-stats-response.dto';
import { EventStateService } from './state/event-state.service';
import { EventCacheService } from './cache/event-cache.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { User } from '../users/entities/user.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import {
  SponsorContribution,
  ContributionStatus,
} from '../sponsors/entities/sponsor-contribution.entity';
import { EscrowService } from '../payments/services/escrow.service';
import { RefundService } from '../payments/refunds/refund.service';
import { CurrenciesService } from '../currencies/currencies.service';
import { EventImage } from './entities/event-image.entity';
import { AddEventImageDto } from './dto/add-event-image.dto';
import { UpdateImageOrderDto } from './dto/update-image-order.dto';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type EventWithCapacity = Event & {
  soldTickets: number;
  remainingCapacity: number | null;
  availableSpots: number | null;
};

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(TicketEntity)
    private readonly ticketRepository: Repository<TicketEntity>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(SponsorContribution)
    private readonly contributionRepository: Repository<SponsorContribution>,
    @InjectRepository(EventImage)
    private readonly eventImageRepo: Repository<EventImage>,
    private readonly eventStateService: EventStateService,
    private readonly eventCacheService: EventCacheService,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly escrowService: EscrowService,
    @Inject(forwardRef(() => RefundService))
    private readonly refundService: RefundService,
    private readonly currenciesService: CurrenciesService,
    @InjectRepository(EventSeries)
    private readonly eventSeriesRepository: Repository<EventSeries>,
  ) {}

  async createEvent(dto: CreateEventDto, organizerId: string): Promise<Event> {
    if (dto.currency) {
      const codes = await this.currenciesService.findActiveCodes();
      const supported = codes.map((c) => c.toLowerCase());
      if (!supported.includes(dto.currency.toLowerCase())) {
        throw new BadRequestException(
          `Currency "${dto.currency}" is not supported. Supported: ${codes.join(', ')}`,
        );
      }
    }

    const event = this.eventRepository.create({
      ...dto,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      organizerId,
    });
    return this.eventRepository.save(event);
  }

  async updateEvent(id: string, dto: UpdateEventDto, callerId: string): Promise<Event> {
    const event = await this.getEventById(id);
    if (event.organizerId !== callerId) {
      throw new ForbiddenException('You are not the organiser of this event.');
    }
    if (dto.status !== undefined && dto.status !== event.status) {
      this.eventStateService.validateTransition(event.status, dto.status);
    }
    const previousStatus = event.status;
    const isPublishing = dto.status === EventStatus.PUBLISHED && dto.status !== previousStatus;
    const updates: Partial<Event> = {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.location !== undefined && { location: dto.location }),
      ...(dto.ticketPrice !== undefined && { ticketPrice: dto.ticketPrice }),
      ...(dto.currency !== undefined && { currency: dto.currency }),
      ...(dto.category !== undefined && { category: dto.category }),
      ...(!isPublishing && dto.status !== undefined && { status: dto.status }),
      ...(dto.startDate !== undefined && { startDate: new Date(dto.startDate) }),
      ...(dto.endDate !== undefined && { endDate: new Date(dto.endDate) }),
    };
    Object.assign(event, updates);
    if (isPublishing) {
      await this.eventRepository.save(event);
      const published = await this.publishEvent(id, callerId);
      this.queueLifecycleEmail(published).catch(() => undefined);
      return published;
    }
    const saved = await this.eventRepository.save(event);
    await this.eventCacheService.invalidateCacheEntry(id);

    if (dto.status !== undefined && dto.status !== previousStatus) {
      this.queueLifecycleEmail(saved).catch(() => undefined);
    }
    return saved;
  }

  async publishEvent(id: string, callerId: string): Promise<Event> {
    const event = await this.getEventById(id);
    if (event.organizerId !== callerId) {
      throw new ForbiddenException('You are not the organiser of this event.');
    }
    this.eventStateService.validateTransition(event.status, EventStatus.PUBLISHED);
    event.status = EventStatus.PUBLISHED;
    await this.eventRepository.save(event);
    if (!event.escrowPublicKey || !event.escrowSecretEncrypted) {
      await this.escrowService.createEscrow(event.id);
    }
    await this.auditService.log({
      action: AuditAction.EVENT_PUBLISHED,
      userId: callerId,
      resourceId: id,
    });
    return this.getEventById(id);
  }

  async completeEvent(id: string, callerId: string): Promise<Event> {
    const event = await this.getEventById(id);
    if (event.organizerId !== callerId) {
      throw new ForbiddenException('You are not the organiser of this event.');
    }
    if (new Date() < event.endDate) {
      throw new BadRequestException('Event has not ended yet.');
    }
    this.eventStateService.validateTransition(event.status, EventStatus.COMPLETED);
    event.status = EventStatus.COMPLETED;
    const saved = await this.eventRepository.save(event);
    await this.eventCacheService.invalidateCacheEntry(id);

    await this.auditService.log({
      action: AuditAction.EVENT_COMPLETED,
      userId: callerId,
      resourceId: id,
    });
    this.queueLifecycleEmail(saved).catch(() => undefined);
    return saved;
  }

  async cancelEvent(id: string, callerId: string): Promise<Event> {
    const event = await this.getEventById(id);
    if (event.organizerId !== callerId) {
      throw new ForbiddenException('You are not the organiser of this event.');
    }
    this.eventStateService.validateTransition(event.status, EventStatus.CANCELLED);
    event.status = EventStatus.CANCELLED;
    const saved = await this.eventRepository.save(event);
    await this.eventCacheService.invalidateCacheEntry(id);

    await this.auditService.log({
      action: AuditAction.EVENT_CANCELLED,
      userId: callerId,
      resourceId: id,
    });
    this.refundService
      .refundEvent(id)
      .catch((err) => this.logger.error(`Refund trigger failed for event ${id}`, err));
    this.queueLifecycleEmail(saved).catch(() => undefined);
    return saved;
  }

  async deleteEvent(id: string, callerId: string): Promise<void> {
    const event = await this.getEventById(id);
    if (event.organizerId !== callerId) {
      throw new ForbiddenException('You are not the organiser of this event.');
    }
    await this.eventRepository.remove(event);
    await this.eventCacheService.invalidateCacheEntry(id);
  }

  async getEventById(id: string): Promise<EventWithCapacity> {
    const cached = await this.eventCacheService.fetchCachedMetadata(id);
    if (cached) {
      return cached;
    }

    const event = await this.eventRepository.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException(`Event with id "${id}" not found`);
    }
    const soldTickets = await this.ticketRepository.count({
      where: { eventId: id, status: 'valid' },
    });

    const result = {
    const remainingCapacity =
      event.maxAttendees !== null ? event.maxAttendees - soldTickets : null;

    return {
      ...event,
      soldTickets,
      remainingCapacity,
      availableSpots: remainingCapacity,
    };

    await this.eventCacheService.cacheEventMetadata(id, result);
    return result;
  }

  async listEvents(filterDto: ListEventsDto): Promise<PaginatedResult<EventWithCapacity>> {
    const { status, organizerId, search, category, showAvailableOnly, page = 1, limit = 10 } = filterDto;
    const qb: SelectQueryBuilder<Event> = this.eventRepository
      .createQueryBuilder('event')
      .leftJoin(
        (subQb) =>
          subQb
            .select('t.eventId', 'eventId')
            .addSelect('COUNT(*)', 'soldCount')
            .from(TicketEntity, 't')
            .where("t.status = 'valid'")
            .groupBy('t.eventId'),
        'ticket_counts',
        'ticket_counts."eventId" = event.id',
      )
      .addSelect('COALESCE(ticket_counts."soldCount"::int, 0)', 'soldTickets');
    if (status) qb.andWhere('event.status = :status', { status });
    if (organizerId)
      qb.andWhere('event.organizerId = :organizerId', { organizerId });
    if (search) {
      // Use PostgreSQL full-text search for relevance-ranked results
      qb.andWhere(
        `to_tsvector('english', event.title || ' ' || COALESCE(event.description, '')) @@ plainto_tsquery('english', :search)`,
        { search },
      );
    }
    if (organizerId) qb.andWhere('event.organizerId = :organizerId', { organizerId });
    if (search) qb.andWhere('LOWER(event.title) LIKE LOWER(:search)', { search: `%${search}%` });
    if (category) qb.andWhere('event.category = :category', { category });
    if (filterDto.categoryIds) {
      const ids = filterDto.categoryIds.split(',').filter(Boolean);
      if (ids.length) {
        qb.innerJoin('event.categories', 'cat', 'cat.id IN (:...ids)', { ids });
      }
    }
    if (showAvailableOnly) {
      qb.andWhere(
        '(event.maxAttendees IS NULL OR COALESCE(ticket_counts."soldCount"::int, 0) < event.maxAttendees)',
      );
    }

    if (search) {
      // Rank by full-text relevance when a search term is present
      qb.orderBy(
        `ts_rank(to_tsvector('english', event.title || ' ' || COALESCE(event.description, '')), plainto_tsquery('english', :search2))`,
        'DESC',
      ).addOrderBy('event.createdAt', 'DESC');
      qb.setParameter('search2', search);
    } else {
      qb.orderBy('event.createdAt', 'DESC');
    }

    qb.skip((page - 1) * limit).take(limit);

    const [rawEvents, total] = await Promise.all([
      qb.getRawAndEntities(),
      qb.getCount(),
    ]);

    qb.orderBy('event.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [rawEvents, total] = await Promise.all([qb.getRawAndEntities(), qb.getCount()]);
    const data: EventWithCapacity[] = rawEvents.entities.map((event, i) => {
      const soldTickets = Number(rawEvents.raw[i]?.soldTickets ?? 0);
      const remainingCapacity =
        event.maxAttendees !== null ? event.maxAttendees - soldTickets : null;
      return {
        ...event,
        soldTickets,
        remainingCapacity,
        availableSpots: remainingCapacity,
      };
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getEventStats(id: string, callerId: string): Promise<EventStatsResponseDto> {
    const event = await this.eventRepository.findOne({ where: { id } });
    if (!event) throw new NotFoundException(`Event with id "${id}" not found`);
    if (event.organizerId !== callerId) throw new ForbiddenException('You are not the organiser of this event.');
    const [ticketStats, paymentStats, sponsorStats] = await Promise.all([
      this.ticketRepository
        .createQueryBuilder('t').select('t.status', 'status').addSelect('COUNT(*)', 'count')
        .where('t.eventId = :id', { id }).groupBy('t.status').getRawMany(),
      this.paymentRepository
        .createQueryBuilder('p').select('COALESCE(SUM(p.amount), 0)', 'totalRevenue')
        .addSelect('COUNT(*)', 'refundCount').where('p.eventId = :id AND p.status = :s', { id, s: PaymentStatus.REFUNDED })
        .getRawOne(),
      this.contributionRepository
        .createQueryBuilder('c').innerJoin('c.tier', 'tier').select('COALESCE(SUM(c.amount), 0)', 'totalSponsorship')
        .where('tier.eventId = :id AND c.status = :s', { id, s: ContributionStatus.CONFIRMED }).getRawOne(),
    ]);
    const ticketMap: Record<string, number> = {};
    for (const row of ticketStats) ticketMap[row.status] = Number(row.count);
    const ticketsSold = ticketMap['valid'] ?? 0;
    const ticketsUsed = ticketMap['used'] ?? 0;
    const ticketsRefunded = ticketMap['refunded'] ?? 0;
    const confirmedRevenue = await this.paymentRepository
      .createQueryBuilder('p').select('COALESCE(SUM(p.amount), 0)', 'totalRevenue')
      .where('p.eventId = :id AND p.status = :s', { id, s: PaymentStatus.CONFIRMED }).getRawOne();
    return {
      ticketsSold, ticketsUsed, ticketsRefunded,
      totalRevenue: Number(confirmedRevenue?.totalRevenue ?? 0),
      totalSponsorship: Number(sponsorStats?.totalSponsorship ?? 0),
      refundCount: Number(paymentStats?.refundCount ?? 0),
      remainingCapacity: event.maxAttendees !== null ? event.maxAttendees - (ticketsSold + ticketsUsed) : null,
    };
  }

  async updateEventImage(eventId: string, imageUrl: string, organizerId: string): Promise<Event> {
    const event = await this.eventRepository.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== organizerId) throw new ForbiddenException();
    event.imageUrl = imageUrl;
    return this.eventRepository.save(event);
  }

  async trigger_emergency_protocol(
    id: string, callerId: string,
    data: { protocol?: string; message?: string; emergencyServicesContact?: string },
  ) {
    const event = await this.getEventById(id);
    if (event.organizerId !== callerId) throw new ForbiddenException();
    await this.send_emergency_notifications(id, callerId, data.message ?? 'Emergency protocol activated.');
    return {
      eventId: id, protocol: data.protocol ?? 'standard_evacuation',
      status: 'active', emergencyServicesContact: data.emergencyServicesContact ?? null,
      activatedAt: new Date().toISOString(),
    };
  }

  async track_evacuation_status(id: string, callerId: string) {
    const event = await this.getEventById(id);
    if (event.organizerId !== callerId) throw new ForbiddenException();
    const ticketStats = await this.getEventStats(id, callerId);
    return {
      eventId: id, status: 'tracking',
      checkedInOrUsedTickets: ticketStats.ticketsUsed,
      activeTicketHolders: ticketStats.ticketsSold, updatedAt: new Date().toISOString(),
    };
  }

  async send_emergency_notifications(id: string, callerId: string, message: string) {
    const event = await this.getEventById(id);
    if (event.organizerId !== callerId) throw new ForbiddenException();
    await this.notificationService.queueLifecycleEmail({ ...event, status: EventStatus.CANCELLED } as Event);
    return { eventId: id, message, queued: true };
  }

  async monitor_weather_conditions(id: string, callerId: string) {
    const event = await this.getEventById(id);
    if (event.organizerId !== callerId) throw new ForbiddenException();
    return { eventId: id, location: event.location, status: 'monitoring', riskLevel: 'unknown', checkedAt: new Date().toISOString() };
  }

  async trigger_automatic_postponement(id: string, callerId: string, reason = 'Unsafe weather conditions') {
    const event = await this.getEventById(id);
    if (event.organizerId !== callerId) throw new ForbiddenException();
    event.status = EventStatus.CANCELLED;
    const saved = await this.eventRepository.save(event);
    await this.notificationService.queueLifecycleEmail(saved);
    return saved;
  }

  async reschedule_event(id: string, callerId: string, data: { startDate: string; endDate: string; reason?: string }) {
    const event = await this.getEventById(id);
    if (event.organizerId !== callerId) throw new ForbiddenException();
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      throw new BadRequestException('Invalid reschedule date range.');
    }
    event.startDate = startDate;
    event.endDate = endDate;
    const saved = await this.eventRepository.save(event);
    await this.notificationService.queueLifecycleEmail(saved);
    return { ...saved, rescheduleReason: data.reason ?? null };
  }

  private async queueLifecycleEmail(event: Event): Promise<void> {
    await this.notificationService.queueLifecycleEmail(event);
  }

  async duplicateEvent(id: string, dto: DuplicateEventDto, organizerId: string): Promise<Event> {
    const event = await this.getEventById(id);
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('You are not the organizer of this event.');
    }
    const duplicated = this.eventRepository.create({
      ...event,
      id: undefined,
      title: dto.title ?? `${event.title} (Copy)`,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      status: EventStatus.DRAFT,
      escrowPublicKey: null,
      escrowSecretEncrypted: null,
      createdAt: undefined,
      updatedAt: undefined,
    });
    return this.eventRepository.save(duplicated);
  }

  async create_event_series(
    dto: CreateEventSeriesDto,
    organizerId: string,
  ): Promise<{ series: EventSeries; events: Event[] }> {
    const series = this.eventSeriesRepository.create({
      title: dto.title,
      description: dto.description ?? null,
      location: dto.location ?? null,
      ticketPrice: dto.ticketPrice ?? 0,
      seasonPassPrice: dto.seasonPassPrice ?? null,
      discountPercentage: dto.discountPercentage ?? null,
      currency: dto.currency ?? 'USD',
      organizerId,
      maxAttendees: dto.maxAttendees ?? null,
      category: dto.category ?? EventCategory.OTHER,
      ageRestriction: dto.ageRestriction ?? EventAgeRestriction.NONE,
      imageUrl: dto.imageUrl ?? null,
    } as any) as any as EventSeries;
    const savedSeries = await this.eventSeriesRepository.save(series);

    const occurrences = dto.occurrencesCount ?? 5;
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    const durationMs = end.getTime() - start.getTime();

    const events: Event[] = [];
    for (let i = 0; i < occurrences; i++) {
      const occurrenceStart = new Date(start);
      if (dto.recurrencePattern === 'weekly') {
        occurrenceStart.setDate(start.getDate() + i * 7);
      } else if (dto.recurrencePattern === 'monthly') {
        occurrenceStart.setMonth(start.getMonth() + i);
      } else if (dto.recurrencePattern === 'annually') {
        occurrenceStart.setFullYear(start.getFullYear() + i);
      }

      const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);

      const event = this.eventRepository.create({
        title: `${dto.title} - Occurrence ${i + 1}`,
        description: dto.description ?? null,
        location: dto.location ?? null,
        ticketPrice: dto.ticketPrice ?? 0,
        currency: dto.currency ?? 'USD',
        organizerId,
        maxAttendees: dto.maxAttendees ?? null,
        startDate: occurrenceStart,
        endDate: occurrenceEnd,
        status: EventStatus.DRAFT,
        seriesId: savedSeries.id,
        category: dto.category ?? EventCategory.OTHER,
        ageRestriction: dto.ageRestriction ?? EventAgeRestriction.NONE,
        imageUrl: dto.imageUrl ?? null,
      } as any) as any as Event;
      events.push(event);
    }

    const savedEvents = await this.eventRepository.save(events);
    return { series: savedSeries, events: savedEvents };
  }

  async manage_series_settings(
    seriesId: string,
    dto: UpdateEventSeriesDto,
    organizerId: string,
  ): Promise<{ series: EventSeries; updatedEventsCount: number }> {
    const series = await this.eventSeriesRepository.findOne({
      where: { id: seriesId },
    });
    if (!series) throw new NotFoundException('Event series not found');
    if (series.organizerId !== organizerId) {
      throw new ForbiddenException('Not the organizer of this series');
    }

    Object.assign(series, dto);
    const savedSeries = await this.eventSeriesRepository.save(series);

    const events = await this.eventRepository.find({
      where: { seriesId },
    });

    for (const event of events) {
      if (dto.title !== undefined) {
        event.title = dto.title;
      }
      if (dto.description !== undefined) {
        event.description = dto.description;
      }
      if (dto.location !== undefined) {
        event.location = dto.location;
      }
      if (dto.ticketPrice !== undefined) {
        event.ticketPrice = dto.ticketPrice;
      }
      if (dto.currency !== undefined) {
        event.currency = dto.currency;
      }
      if (dto.maxAttendees !== undefined) {
        event.maxAttendees = dto.maxAttendees;
      }
      if (dto.category !== undefined) {
        event.category = dto.category;
      }
      if (dto.ageRestriction !== undefined) {
        event.ageRestriction = dto.ageRestriction;
      }
      if (dto.imageUrl !== undefined) {
        event.imageUrl = dto.imageUrl;
      }
    }
    await this.eventRepository.save(events);

    return { series: savedSeries, updatedEventsCount: events.length };
  }

  async bulk_update_series(
    seriesId: string,
    dto: BulkUpdateSeriesDto,
    organizerId: string,
  ): Promise<{ updatedEvents: Event[] }> {
    const series = await this.eventSeriesRepository.findOne({
      where: { id: seriesId },
    });
    if (!series) throw new NotFoundException('Event series not found');
    if (series.organizerId !== organizerId) {
      throw new ForbiddenException('Not the organizer of this series');
    }

    const events = await this.eventRepository.find({
      where: { seriesId },
    });

    const targetEvents = dto.eventIds && dto.eventIds.length > 0
      ? events.filter((e) => dto.eventIds!.includes(e.id))
      : events;

    for (const event of targetEvents) {
      if (dto.status !== undefined) {
        event.status = dto.status;
      }
      if (dto.ticketPrice !== undefined) {
        event.ticketPrice = dto.ticketPrice;
      }
    }

    const saved = await this.eventRepository.save(targetEvents);
    return { updatedEvents: saved };
  async addEventImage(eventId: string, organizerId: string, dto: AddEventImageDto): Promise<EventImage> {
    const event = await this.eventRepository.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== organizerId) throw new ForbiddenException();
    const count = await this.eventImageRepo.count({ where: { eventId } });
    if (count >= 10) throw new BadRequestException('Maximum 10 images per event');
    if (dto.isPrimary) {
      await this.eventImageRepo.update({ eventId }, { isPrimary: false });
    }
    return this.eventImageRepo.save(this.eventImageRepo.create({ ...dto, eventId }));
  }

  async updateImageOrder(eventId: string, organizerId: string, dto: UpdateImageOrderDto): Promise<void> {
    const event = await this.eventRepository.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== organizerId) throw new ForbiddenException();
    await Promise.all(dto.images.map(({ id, order }) => this.eventImageRepo.update(id, { order })));
  }

  async deleteEventImage(eventId: string, imageId: string, organizerId: string): Promise<void> {
    const event = await this.eventRepository.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== organizerId) throw new ForbiddenException();
    await this.eventImageRepo.delete({ id: imageId, eventId });
  }

  async updateCapacity(
    id: string,
    callerId: string,
    maxAttendees: number | null,
  ): Promise<EventWithCapacity> {
    const event = await this.getEventById(id);
    if (event.organizerId !== callerId) throw new ForbiddenException();

    if (maxAttendees !== null) {
      if (maxAttendees < 0) {
        throw new BadRequestException('maxAttendees must be a non-negative integer.');
      }
      if (maxAttendees < event.soldTickets) {
        throw new ConflictException(
          `Cannot reduce capacity to ${maxAttendees}: ${event.soldTickets} ticket(s) have already been sold.`,
        );
      }
    }

    await this.eventRepository.update(id, { maxAttendees });
    return this.getEventById(id);
  }
}
