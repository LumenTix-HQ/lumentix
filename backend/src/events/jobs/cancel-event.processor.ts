import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { RefundService } from '../../payments/refunds/refund.service';
import { SmartRefundService } from '../smart-refund.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/entities/audit-log.entity';
import { Event } from '../entities/event.entity';
import { TicketEntity } from '../../tickets/entities/ticket.entity';
import { User } from '../../users/entities/user.entity';
import { CalendarService } from '../../calendar/calendar.service';

@Processor('events')
export class CancelEventProcessor {
  private readonly logger = new Logger(CancelEventProcessor.name);

  constructor(
    private readonly refundService: RefundService,
    private readonly smartRefundService: SmartRefundService,
    private readonly auditService: AuditService,
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(TicketEntity)
    private readonly ticketsRepository: Repository<TicketEntity>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly calendarService: CalendarService,
  ) {}

  @Process('cancel-event')
  async handleCancelEvent(job: Job<{ eventId: string }>) {
    const { eventId } = job.data;
    this.logger.log(`Starting refund process for event ${eventId}`);
    try {
      await this.refundService.refundAllForEvent(eventId);
      this.logger.log(`Successfully processed refunds for event ${eventId}`);
    } catch (error) {
      this.logger.error(`Failed to process refunds for event ${eventId}`, error.stack);
      throw error;
    }

    await this.notifyCalendarCancellation(eventId);
    await this.processOnChainCancellation(eventId);
  }

  /**
   * Analytics #992 — email every ticket holder a CANCEL-method calendar
   * invite so it's automatically removed from any calendar app they
   * already added it to. Best-effort: a failure here must not block the
   * refund flow that already succeeded above.
   */
  private async notifyCalendarCancellation(eventId: string): Promise<void> {
    try {
      const event = await this.eventsRepository.findOne({ where: { id: eventId } });
      if (!event) return;

      const tickets = await this.ticketsRepository.find({ where: { eventId } });
      const ownerIds = [...new Set(tickets.map((t) => t.ownerId))];
      if (ownerIds.length === 0) return;

      const users = await this.usersRepository.find({ where: { id: In(ownerIds) } });
      const attendees = users
        .filter((u) => Boolean(u.email))
        .map((u) => ({ email: u.email, name: (u as any).displayName ?? undefined }));

      await this.calendarService.remove_cancelled_event(event, attendees);
    } catch (error) {
      this.logger.error(`Failed to send calendar cancellation for event ${eventId}`, error?.stack);
    }
  }

  /**
   * Automatically cancel and refund any LumentixContract counterpart. Events
   * without contract metadata use the classic-Stellar escrow refund above.
   */
  private async processOnChainCancellation(eventId: string): Promise<void> {
    const event = await this.eventsRepository.findOne({
      where: { id: eventId },
      select: ['id', 'contractEventId', 'escrowSecretEncrypted'],
    });

    if (!event) {
      throw new Error(`Event ${eventId} not found during on-chain refund`);
    }
    if (!event.contractEventId) {
      return;
    }
    if (!event.escrowSecretEncrypted) {
      throw new Error(`Event ${eventId} has incomplete on-chain refund configuration`);
    }

    await this.smartRefundService.cancelEventOnChain(eventId);
    const { refundedCount } = await this.smartRefundService.executeMassRefund(eventId);
    const { complete } = await this.smartRefundService.verifyRefundCompletion(eventId);
    if (!complete) {
      throw new Error(`On-chain refunds for event ${eventId} are not complete`);
    }

    await this.eventsRepository.update(eventId, {
      onChainRefundVerifiedAt: new Date(),
    });

    await this.auditService.log({
      action: AuditAction.EVENT_CANCELLED_ON_CHAIN,
      userId: 'system',
      resourceId: eventId,
      meta: { contractEventId: event.contractEventId },
    });
    await this.auditService.log({
      action: AuditAction.MASS_REFUND_EXECUTED_ON_CHAIN,
      userId: 'system',
      resourceId: eventId,
      meta: { contractEventId: event.contractEventId, refundedCount, verified: complete },
    });

    this.logger.log(
      `On-chain cancellation complete for event ${eventId}: refunded=${refundedCount} verified=${complete}`,
    );
  }
}
