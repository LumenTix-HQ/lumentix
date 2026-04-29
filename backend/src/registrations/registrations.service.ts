import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import {
  Registration,
  RegistrationStatus,
} from './entities/registration.entity';
import { EventsService } from '../events/events.service';
import { EventStatus } from '../events/entities/event.entity';
import { ListRegistrationsDto } from './dto/list-registrations.dto';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { RefundService } from '../payments/refunds/refund.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { UsersService } from '../users/users.service';

export interface RegisterResult {
  registration: Registration;
  httpStatus: HttpStatus;
  waitlistPosition?: number;
}

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    @InjectRepository(Registration)
    private readonly repo: Repository<Registration>,
    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,
    private readonly eventsService: EventsService,
    private readonly refundService: RefundService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
    private readonly usersService: UsersService,
  ) {}

  // ── POST /events/:id/register ──────────────────────────────────────────────

  async register(eventId: string, userId: string): Promise<RegisterResult> {
    const event = await this.eventsService.getEventById(eventId);

    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException(
        `Event is not available for registration (status: ${event.status})`,
      );
    }

    const existing = await this.repo.findOne({
      where: [
        { eventId, userId, status: RegistrationStatus.PENDING },
        { eventId, userId, status: RegistrationStatus.CONFIRMED },
        { eventId, userId, status: RegistrationStatus.WAITLISTED },
      ],
    });
    if (existing) {
      throw new ConflictException('You are already registered for this event');
    }

    if (event.maxAttendees !== null && event.maxAttendees !== undefined) {
      const confirmed = await this.repo.count({
        where: [
          { eventId, status: RegistrationStatus.CONFIRMED },
          { eventId, status: RegistrationStatus.PENDING },
        ],
      });

      if (confirmed >= event.maxAttendees) {
        const reg = await this.repo.save(
          this.repo.create({
            eventId,
            userId,
            status: RegistrationStatus.WAITLISTED,
          }),
        );
        const position = await this.getWaitlistPosition(eventId, reg.id);
        return {
          registration: reg,
          httpStatus: HttpStatus.ACCEPTED,
          waitlistPosition: position,
        };
      }
    }

    const reg = await this.repo.save(
      this.repo.create({ eventId, userId, status: RegistrationStatus.PENDING }),
    );
    return { registration: reg, httpStatus: HttpStatus.CREATED };
  }

  // ── GET /events/:id/registrations (organizer) ──────────────────────────────

  async listForEvent(
    eventId: string,
    callerId: string,
    dto: ListRegistrationsDto,
  ) {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== callerId) throw new ForbiddenException();

    const { page = 1, limit = 20 } = dto;
    const [data, total] = await this.repo.findAndCount({
      where: { eventId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── GET /users/me/registrations ────────────────────────────────────────────

  async listForUser(userId: string, dto: ListRegistrationsDto) {
    const { page = 1, limit = 20 } = dto;
    const [data, total] = await this.repo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const enriched = await Promise.all(
      data.map(async (r) => {
        if (r.status === RegistrationStatus.WAITLISTED) {
          const position = await this.getWaitlistPosition(r.eventId, r.id);
          return { ...r, waitlistPosition: position };
        }
        return r;
      }),
    );

    return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Cancel (simple, no refund) ─────────────────────────────────────────────

  async cancel(registrationId: string, callerId: string): Promise<Registration> {
    const reg = await this.findById(registrationId);
    if (reg.userId !== callerId) throw new ForbiddenException();
    const wasConfirmed = reg.status === RegistrationStatus.CONFIRMED;

    if (
      reg.status !== RegistrationStatus.CONFIRMED &&
      reg.status !== RegistrationStatus.PENDING
    ) {
      throw new BadRequestException('Registration cannot be cancelled');
    }

    reg.status = RegistrationStatus.CANCELLED;
    const saved = await this.repo.save(reg);

    if (wasConfirmed) {
      await this.promoteFromWaitlist(reg.eventId);
    }

    return saved;
  }

  // ── DELETE /events/:eventId/registrations/:registrationId (with refund) ────

  async cancelWithRefund(
    eventId: string,
    registrationId: string,
    callerId: string,
  ): Promise<Registration> {
    const reg = await this.findById(registrationId);

    if (reg.userId !== callerId) throw new ForbiddenException();
    if (reg.eventId !== eventId)
      throw new NotFoundException('Registration not found for this event');

    if (reg.status !== RegistrationStatus.CONFIRMED) {
      throw new BadRequestException(
        'Only confirmed registrations can be cancelled',
      );
    }

    const event = await this.eventsService.getEventById(eventId);

    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException('Cannot cancel registration for this event');
    }

    const hoursUntilStart =
      (new Date(event.startDate).getTime() - Date.now()) / (1000 * 60 * 60);
    const cutoff = Number(process.env.REFUND_CUTOFF_HOURS ?? 24);
    if (hoursUntilStart < cutoff) {
      throw new BadRequestException(
        `Refunds are not available within ${cutoff} hours of the event start.`,
      );
    }

    const saved = await this.dataSource.transaction(async (em) => {
      reg.status = RegistrationStatus.CANCELLED;
      const result = await em.save(Registration, reg);

      if (reg.ticketId) {
        await em.update(TicketEntity, { id: reg.ticketId }, { status: 'refunded' });
      }

      return result;
    });

    // Stellar refund outside DB transaction (not transactional)
    if (reg.paymentId) {
      await this.refundService.refundSinglePayment(reg.paymentId);
    }

    await this.auditService.log({
      action: 'REGISTRATION_CANCELLED',
      userId: callerId,
      resourceId: registrationId,
      meta: { eventId, paymentId: reg.paymentId },
    });

    return saved;
  }

  // ── Link payment on confirmation ───────────────────────────────────────────

  async linkPayment(
    eventId: string,
    userId: string,
    paymentId: string,
  ): Promise<void> {
    const reg = await this.repo.findOne({
      where: { eventId, userId, status: RegistrationStatus.PENDING },
    });
    if (!reg) return;
    reg.paymentId = paymentId;
    reg.status = RegistrationStatus.CONFIRMED;
    await this.repo.save(reg);
  }

  async linkTicket(
    eventId: string,
    userId: string,
    ticketId: string,
  ): Promise<void> {
    const reg = await this.repo.findOne({
      where: [
        { eventId, userId, status: RegistrationStatus.CONFIRMED },
        { eventId, userId, status: RegistrationStatus.PENDING },
      ],
    });
    if (!reg) return;
    reg.ticketId = ticketId;
    await this.repo.save(reg);
  }

  // ── Waitlist helpers ───────────────────────────────────────────────────────

  async getWaitlistPosition(eventId: string, registrationId: string): Promise<number> {
    const reg = await this.findById(registrationId);
    const ahead = await this.repo.count({
      where: {
        eventId,
        status: RegistrationStatus.WAITLISTED,
        createdAt: LessThan(reg.createdAt),
      },
    });
    return ahead + 1;
  }

  async promoteFromWaitlist(eventId: string): Promise<void> {
    const next = await this.repo.findOne({
      where: { eventId, status: RegistrationStatus.WAITLISTED },
      order: { createdAt: 'ASC' },
    });
    if (!next) return;

    next.status = RegistrationStatus.PENDING;
    await this.repo.save(next);

    this.logger.log(
      `Promoted registration ${next.id} from waitlist for event ${eventId}`,
    );

    // Send promotion email (best-effort)
    try {
      const user = await this.usersService.findById(next.userId);
      const event = await this.eventsService.getEventById(eventId);
      if (user && (user as any).email) {
        await this.notificationService.queueEventPublishedEmail({
          email: (user as any).email,
          eventTitle: event.title,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Could not send waitlist promotion email for registration ${next.id}`,
        err,
      );
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async findById(id: string): Promise<Registration> {
    const reg = await this.repo.findOne({ where: { id } });
    if (!reg) throw new NotFoundException(`Registration "${id}" not found`);
    return reg;
  }
}
