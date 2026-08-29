import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';

import {
  GiftStatus,
  GiftWrapStyle,
  TicketGift,
} from './ticket-gift.entity';
import { TicketEntity } from '../entities/ticket.entity';
import { Event } from '../../events/entities/event.entity';
import { TicketsService } from '../tickets.service';
import { AuditService } from '../../audit/audit.service';

/** Statuses in which a gift has been created but not yet handed over. */
const IN_FLIGHT: GiftStatus[] = [GiftStatus.WRAPPED, GiftStatus.SCHEDULED];

export interface GiftWrapResult {
  giftId: string;
  ticketId: string;
  status: GiftStatus;
  wrapStyle: GiftWrapStyle;
  message: string | null;
  scheduledFor: Date | null;
  deliveredAt: Date | null;
}

export interface UnwrapAnimation {
  giftId: string;
  wrapStyle: GiftWrapStyle;
  message: string | null;
  senderId: string;
  ticketId: string;
  eventId: string;
  eventTitle: string | null;
  /** Ordered reveal steps for the client to play. */
  frames: Array<{ step: string; durationMs: number }>;
  totalDurationMs: number;
  /** False when the animation has already been played once. */
  firstUnwrap: boolean;
}

/**
 * Ticket gifting with a message, wrapping and scheduled delivery (issue
 * #1000).
 *
 * The ticket does not move when it is wrapped — it moves at delivery. Handing
 * ownership over at wrap time would let a recipient walk into the event days
 * before the gift was meant to be revealed, and would leave a cancelled gift
 * needing to claw a ticket back from someone who already had it.
 */
@Injectable()
export class GiftingService {
  private readonly logger = new Logger(GiftingService.name);

  /** How long the reveal runs, per wrap style. */
  private static readonly FRAMES: Record<
    GiftWrapStyle,
    Array<{ step: string; durationMs: number }>
  > = {
    [GiftWrapStyle.CLASSIC]: [
      { step: 'ribbon-pull', durationMs: 700 },
      { step: 'box-open', durationMs: 600 },
      { step: 'ticket-rise', durationMs: 800 },
      { step: 'message-reveal', durationMs: 900 },
    ],
    [GiftWrapStyle.CONFETTI]: [
      { step: 'box-burst', durationMs: 500 },
      { step: 'confetti-fall', durationMs: 1200 },
      { step: 'ticket-rise', durationMs: 800 },
      { step: 'message-reveal', durationMs: 900 },
    ],
    [GiftWrapStyle.FIREWORKS]: [
      { step: 'fuse-light', durationMs: 600 },
      { step: 'burst', durationMs: 1000 },
      { step: 'ticket-rise', durationMs: 800 },
      { step: 'message-reveal', durationMs: 900 },
    ],
    [GiftWrapStyle.ENVELOPE]: [
      { step: 'seal-break', durationMs: 600 },
      { step: 'flap-open', durationMs: 500 },
      { step: 'card-slide', durationMs: 700 },
      { step: 'message-reveal', durationMs: 900 },
    ],
    [GiftWrapStyle.BIRTHDAY]: [
      { step: 'candles-light', durationMs: 700 },
      { step: 'candles-blow', durationMs: 800 },
      { step: 'box-open', durationMs: 600 },
      { step: 'message-reveal', durationMs: 900 },
    ],
  };

  private static readonly MAX_MESSAGE_LENGTH = 500;

  constructor(
    @InjectRepository(TicketGift)
    private readonly giftRepo: Repository<TicketGift>,
    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    private readonly ticketsService: TicketsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Wrap a ticket as a gift.
   *
   * Delivers immediately unless `scheduledFor` is in the future, in which case
   * the gift waits for {@link deliverDueGifts}.
   */
  async wrapTicketGift(
    ticketId: string,
    senderId: string,
    input: {
      recipientId: string;
      message?: string;
      wrapStyle?: GiftWrapStyle;
      scheduledFor?: Date;
    },
  ): Promise<GiftWrapResult> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (ticket.ownerId !== senderId) {
      throw new ForbiddenException('Only the ticket owner can gift it');
    }
    if (ticket.status !== 'valid') {
      throw new BadRequestException('Only a valid ticket can be gifted');
    }
    if (input.recipientId === senderId) {
      throw new BadRequestException('A ticket cannot be gifted to yourself');
    }
    // A listed ticket is promised to the marketplace; gifting it out from
    // under a pending sale would leave a buyer paying for nothing.
    if (ticket.isListed) {
      throw new ConflictException(
        'Unlist the ticket from resale before gifting it',
      );
    }

    const message = this.validateMessage(input.message);
    const scheduledFor = await this.validateSchedule(ticket, input.scheduledFor);

    const existing = await this.giftRepo.findOne({
      where: { ticketId, status: In(IN_FLIGHT) },
    });
    if (existing) {
      throw new ConflictException(
        'This ticket already has a gift in flight; cancel it first',
      );
    }

    const deliverNow = scheduledFor === null;
    const gift = this.giftRepo.create({
      ticketId,
      eventId: ticket.eventId,
      senderId,
      recipientId: input.recipientId,
      message,
      wrapStyle: input.wrapStyle ?? GiftWrapStyle.CLASSIC,
      status: deliverNow ? GiftStatus.WRAPPED : GiftStatus.SCHEDULED,
      scheduledFor,
      deliveredAt: null,
      unwrappedAt: null,
    });

    const saved = await this.giftRepo.save(gift);

    await this.auditService.log({
      action: 'TICKET_GIFT_WRAPPED',
      userId: senderId,
      resourceId: saved.id,
      meta: {
        ticketId,
        recipientId: input.recipientId,
        scheduledFor: scheduledFor?.toISOString() ?? null,
      },
    });

    if (deliverNow) {
      return this.toResult(await this.deliverGift(saved));
    }

    this.logger.log(
      `Gift ${saved.id} scheduled for ${scheduledFor!.toISOString()}`,
    );
    return this.toResult(saved);
  }

  /**
   * Move an existing wrapped gift to a future date, or bring it forward.
   *
   * Separate from `wrapTicketGift` so a sender can change their mind about
   * timing without re-wrapping — the message and style survive.
   */
  async scheduleGiftDelivery(
    giftId: string,
    senderId: string,
    scheduledFor: Date,
  ): Promise<GiftWrapResult> {
    const gift = await this.giftRepo.findOne({ where: { id: giftId } });
    if (!gift) throw new NotFoundException('Gift not found');
    if (gift.senderId !== senderId) {
      throw new ForbiddenException('Only the sender can reschedule a gift');
    }
    if (!IN_FLIGHT.includes(gift.status)) {
      throw new BadRequestException(
        `A ${gift.status} gift can no longer be rescheduled`,
      );
    }

    const ticket = await this.ticketRepo.findOne({
      where: { id: gift.ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const validated = await this.validateSchedule(ticket, scheduledFor, {
      required: true,
    });

    gift.scheduledFor = validated;
    gift.status = GiftStatus.SCHEDULED;
    const saved = await this.giftRepo.save(gift);

    await this.auditService.log({
      action: 'TICKET_GIFT_RESCHEDULED',
      userId: senderId,
      resourceId: saved.id,
      meta: { ticketId: gift.ticketId, scheduledFor: validated!.toISOString() },
    });

    return this.toResult(saved);
  }

  /**
   * Return the reveal the recipient should play, and record that it happened.
   *
   * The animation is described as data rather than rendered here — the shape
   * of the reveal is a client concern, and returning frames keeps the
   * server from dictating how it looks. Replays are allowed (a recipient may
   * want to watch it again) but only the first is recorded.
   */
  async unwrapGiftAnimation(
    giftId: string,
    recipientId: string,
  ): Promise<UnwrapAnimation> {
    const gift = await this.giftRepo.findOne({ where: { id: giftId } });
    if (!gift) throw new NotFoundException('Gift not found');

    if (gift.recipientId !== recipientId) {
      throw new ForbiddenException('Only the recipient can unwrap this gift');
    }
    if (gift.status === GiftStatus.CANCELLED) {
      throw new BadRequestException('This gift was cancelled');
    }
    // Undelivered gifts must not leak their message early — that is the whole
    // point of scheduling one.
    if (IN_FLIGHT.includes(gift.status)) {
      throw new BadRequestException('This gift has not been delivered yet');
    }

    const firstUnwrap = gift.status === GiftStatus.DELIVERED;
    if (firstUnwrap) {
      gift.status = GiftStatus.UNWRAPPED;
      gift.unwrappedAt = new Date();
      await this.giftRepo.save(gift);

      await this.auditService.log({
        action: 'TICKET_GIFT_UNWRAPPED',
        userId: recipientId,
        resourceId: gift.id,
        meta: { ticketId: gift.ticketId, senderId: gift.senderId },
      });
    }

    const event = await this.eventRepo.findOne({
      where: { id: gift.eventId },
    });
    const frames = GiftingService.FRAMES[gift.wrapStyle];

    return {
      giftId: gift.id,
      wrapStyle: gift.wrapStyle,
      message: gift.message,
      senderId: gift.senderId,
      ticketId: gift.ticketId,
      eventId: gift.eventId,
      eventTitle: event?.title ?? null,
      frames,
      totalDurationMs: frames.reduce((sum, f) => sum + f.durationMs, 0),
      firstUnwrap,
    };
  }

  /**
   * Cancel a gift that has not landed yet. The ticket never left the sender,
   * so there is nothing to reverse.
   */
  async cancelGift(giftId: string, senderId: string): Promise<GiftWrapResult> {
    const gift = await this.giftRepo.findOne({ where: { id: giftId } });
    if (!gift) throw new NotFoundException('Gift not found');
    if (gift.senderId !== senderId) {
      throw new ForbiddenException('Only the sender can cancel a gift');
    }
    if (!IN_FLIGHT.includes(gift.status)) {
      throw new BadRequestException(
        'A gift can only be cancelled before it is delivered',
      );
    }

    gift.status = GiftStatus.CANCELLED;
    const saved = await this.giftRepo.save(gift);

    await this.auditService.log({
      action: 'TICKET_GIFT_CANCELLED',
      userId: senderId,
      resourceId: saved.id,
      meta: { ticketId: gift.ticketId },
    });

    return this.toResult(saved);
  }

  /**
   * Deliver every gift whose scheduled time has arrived.
   *
   * Each gift is delivered independently so one failure — a ticket refunded
   * between wrapping and delivery, say — does not hold up the rest of the
   * batch.
   */
  async deliverDueGifts(now: Date = new Date()): Promise<{
    delivered: number;
    failed: number;
  }> {
    const due = await this.giftRepo.find({
      where: {
        status: GiftStatus.SCHEDULED,
        scheduledFor: LessThanOrEqual(now),
      },
      order: { scheduledFor: 'ASC' },
    });

    let delivered = 0;
    let failed = 0;

    for (const gift of due) {
      try {
        await this.deliverGift(gift);
        delivered += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Failed to deliver gift ${gift.id}: ${(error as Error).message}`,
        );
      }
    }

    return { delivered, failed };
  }

  // ───────────────────────────────────────────────────────────────────────

  /** Hand the ticket over and mark the gift delivered. */
  private async deliverGift(gift: TicketGift): Promise<TicketGift> {
    await this.ticketsService.transferTicket(
      gift.ticketId,
      gift.senderId,
      gift.recipientId,
    );

    gift.status = GiftStatus.DELIVERED;
    gift.deliveredAt = new Date();
    const saved = await this.giftRepo.save(gift);

    await this.auditService.log({
      action: 'TICKET_GIFT_DELIVERED',
      userId: gift.senderId,
      resourceId: gift.id,
      meta: { ticketId: gift.ticketId, recipientId: gift.recipientId },
    });

    return saved;
  }

  private validateMessage(message?: string): string | null {
    if (message === undefined || message === null) return null;
    const trimmed = message.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > GiftingService.MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(
        `Gift message must be ${GiftingService.MAX_MESSAGE_LENGTH} characters or fewer`,
      );
    }
    return trimmed;
  }

  /**
   * A delivery date must be in the future and before the event starts — a
   * gift that lands after the doors close is a ticket the recipient can never
   * use.
   */
  private async validateSchedule(
    ticket: TicketEntity,
    scheduledFor: Date | undefined,
    options: { required?: boolean } = {},
  ): Promise<Date | null> {
    if (!scheduledFor) {
      if (options.required) {
        throw new BadRequestException('A delivery date is required');
      }
      return null;
    }

    const when = new Date(scheduledFor);
    if (Number.isNaN(when.getTime())) {
      throw new BadRequestException('Delivery date is not a valid date');
    }
    if (when.getTime() <= Date.now()) {
      // Not an error — a date that has already passed just means "now".
      return null;
    }

    const event = await this.eventRepo.findOne({
      where: { id: ticket.eventId },
    });
    if (event && when.getTime() >= new Date(event.startDate).getTime()) {
      throw new BadRequestException(
        'Delivery must be scheduled before the event starts',
      );
    }

    return when;
  }

  private toResult(gift: TicketGift): GiftWrapResult {
    return {
      giftId: gift.id,
      ticketId: gift.ticketId,
      status: gift.status,
      wrapStyle: gift.wrapStyle,
      message: gift.message,
      scheduledFor: gift.scheduledFor,
      deliveredAt: gift.deliveredAt,
    };
  }
}
