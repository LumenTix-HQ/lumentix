import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Event, EventStatus } from './entities/event.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { DuplicateEventDto } from './dto/duplicate-event.dto';
import { EventStatsResponseDto } from './dto/event-stats-response.dto';
import { EventStateService } from './state/event-state.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { User } from '../users/entities/user.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { SponsorContribution, ContributionStatus } from '../sponsors/entities/sponsor-contribution.entity';
import { EscrowService } from '../payments/services/escrow.service';
import { RefundService } from '../payments/refunds/refund.service';

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
    private readonly eventStateService: EventStateService,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly escrowService: EscrowService,
    @Inject(forwardRef(() => RefundService))
    private readonly refundService: RefundService,
  ) { }

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

    if (event.organizerId !== callerId) {
      throw new ForbiddenException('You are not the organiser of this event.');
    }

    if (dto.status !== undefined && dto.status !== event.status) {
      this.eventStateService.validateTransition(event.status, dto.status);
    }

    const previousStatus = event.status;
    const isPublishing =
      dto.status === EventStatus.PUBLISHED && dto.status !== previousStatus;

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

    await this.auditService.log({
      action: AuditAction.EVENT_CANCELLED,
      userId: callerId,
      resourceId: id,
    });

    // Non-blocking refund trigger — failures are logged, not thrown
    this.refundService.refundEvent(id).catch((err) =>
      this.logger.error(`Refund trigger failed for event ${id}`, err),
    );

    this.queueLifecycleEmail(saved).catch(() => undefined);

    return saved;
  }

  async deleteEvent(id: string, callerId: string): Promise<void> {
    const event = await this.getEventById(id);

    if (event.organizerId !== callerId) {
      throw new ForbiddenException('You are not the organiser of this event.');
    }

    await this.eventRepository.remove(event);
  }

  async getEventById(id: string): Promise<EventWithCapacity> {
    const event = await this.eventRepository.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException(`Event with id "${id}" not found`);
    }

    const soldTickets = await this.ticketRepository.count({
      where: { eventId: id, status: 'valid' },
    });

    return {
      ...event,
      soldTickets,
      remainingCapacity: event.maxAttendees !== null ? event.maxAttendees - soldTickets : null,
    };
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
    if (organizerId) qb.andWhere('event.organizerId = :organizerId', { organizerId });
    if (search) qb.andWhere('LOWER(event.title) LIKE LOWER(:search)', { search: `%${search}%` });
    if (category) qb.andWhere('event.category = :category', { category });
    if (showAvailableOnly) {
      qb.andWhere(
        '(event.maxAttendees IS NULL OR COALESCE(ticket_counts."soldCount"::int, 0) < event.maxAttendees)',
      );
    }

    qb.orderBy('event.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rawEvents, total] = await Promise.all([
      qb.getRawAndEntities(),
      qb.getCount(),
    ]);

    const data: EventWithCapacity[] = rawEvents.entities.map((event, i) => {
      const soldTickets = Number(rawEvents.raw[i]?.soldTickets ?? 0);
      return {
        ...event,
        soldTickets,
        remainingCapacity: event.maxAttendees !== null ? event.maxAttendees - soldTickets : null,
      };
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getEventStats(id: string, callerId: string): Promise<EventStatsResponseDto> {
    const event = await this.eventRepository.findOne({ where: { id } });
    if (!event) throw new NotFoundException(`Event with id "${id}" not found`);
    if (event.organizerId !== callerId) {
      throw new ForbiddenException('You are not the organiser of this event.');
    }

    const [ticketStats, paymentStats, sponsorStats] = await Promise.all([
      this.ticketRepository
        .createQueryBuilder('t')
        .select('t.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('t.eventId = :id', { id })
        .groupBy('t.status')
        .getRawMany(),
      this.paymentRepository
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'totalRevenue')
        .addSelect('COUNT(*)', 'refundCount')
        .where('p.eventId = :id AND p.status = :s', { id, s: PaymentStatus.REFUNDED })
        .getRawOne(),
      this.contributionRepository
        .createQueryBuilder('c')
        .innerJoin('c.tier', 'tier')
        .select('COALESCE(SUM(c.amount), 0)', 'totalSponsorship')
        .where('tier.eventId = :id AND c.status = :s', { id, s: ContributionStatus.CONFIRMED })
        .getRawOne(),
    ]);

    const ticketMap: Record<string, number> = {};
    for (const row of ticketStats) {
      ticketMap[row.status] = Number(row.count);
    }

    const ticketsSold = ticketMap['valid'] ?? 0;
    const ticketsUsed = ticketMap['used'] ?? 0;
    const ticketsRefunded = ticketMap['refunded'] ?? 0;

    const confirmedRevenue = await this.paymentRepository
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'totalRevenue')
      .where('p.eventId = :id AND p.status = :s', { id, s: PaymentStatus.CONFIRMED })
      .getRawOne();

    return {
      ticketsSold,
      ticketsUsed,
      ticketsRefunded,
      totalRevenue: Number(confirmedRevenue?.totalRevenue ?? 0),
      totalSponsorship: Number(sponsorStats?.totalSponsorship ?? 0),
      refundCount: Number(paymentStats?.refundCount ?? 0),
      remainingCapacity: event.maxAttendees !== null ? event.maxAttendees - (ticketsSold + ticketsUsed) : null,
    };
  }

  private async queueLifecycleEmail(event: Event): Promise<void> {
    await this.notificationService.queueLifecycleEmail(event);
  }
}
