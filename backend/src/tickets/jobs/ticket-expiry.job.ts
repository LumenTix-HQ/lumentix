import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketEntity } from '../entities/ticket.entity';
import { Event } from '../../events/entities/event.entity';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class TicketExpiryJob {
  private readonly logger = new Logger(TicketExpiryJob.name);

  constructor(
    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,
    private readonly auditService: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async expireTickets(): Promise<void> {
    const tickets = await this.ticketRepo
      .createQueryBuilder('ticket')
      .innerJoin(Event, 'event', 'event.id = ticket.eventId')
      .where('ticket.status = :status', { status: 'valid' })
      .andWhere('event.endDate < :now', { now: new Date() })
      .getMany();

    if (tickets.length === 0) return;

    for (const ticket of tickets) {
      ticket.status = 'expired';
    }
    await this.ticketRepo.save(tickets);

    await this.auditService.log({
      action: 'TICKETS_EXPIRED',
      userId: 'system',
      meta: { count: tickets.length },
    });

    this.logger.log(`Expired ${tickets.length} ticket(s)`);
  }
}
