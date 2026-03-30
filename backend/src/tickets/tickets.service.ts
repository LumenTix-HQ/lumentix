import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as qrcode from 'qrcode';

import { TicketEntity } from './entities/ticket.entity';
import { TicketSigningService } from './ticket-signing.service';
import { IssueTicketResponseDto } from './dto/issue-ticket-response.dto';
import { BulkIssueResultDto } from './dto/bulk-issue-result.dto';
import { PaymentsService } from '../payments/payments.service';
import { PaymentStatus } from '../payments/entities/payment.entity';
import { StellarService } from '../stellar/stellar.service';
import { NotificationService } from '../notifications/notification.service';
import { Event } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
    private readonly stellarService: StellarService,
    private readonly configService: ConfigService,
    private readonly ticketSigningService: TicketSigningService,
    private readonly notificationService: NotificationService,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findByEvent(eventId: string, requesterId: string, paginationDto: any) {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== requesterId) {
      throw new ForbiddenException('You are not the organizer of this event.');
    }

    const queryBuilder = this.ticketRepo
      .createQueryBuilder('ticket')
      .where('ticket.eventId = :eventId', { eventId });

    if (paginationDto?.status) {
      queryBuilder.andWhere('ticket.status = :status', {
        status: paginationDto.status,
      });
    }

    const { paginate } = await import('../common/pagination/pagination.helper');
    return paginate(queryBuilder, paginationDto, 'ticket');
  }

  async getEventTicketSummary(eventId: string, requesterId: string) {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== requesterId) {
      throw new ForbiddenException('You are not the organizer of this event.');
    }

    const stats = await this.ticketRepo
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('t.eventId = :eventId', { eventId })
      .groupBy('t.status')
      .getRawMany();

    const summary: Record<string, number> = { total: 0, valid: 0, used: 0, refunded: 0 };
    for (const row of stats) {
      summary[row.status] = Number(row.count);
      summary.total += Number(row.count);
    }
    return summary;
  }

  async findOne(id: string, requesterId: string): Promise<TicketEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.ownerId !== requesterId) {
      throw new ForbiddenException('You do not own this ticket.');
    }
    return ticket;
  }

  async findByOwner(ownerId: string, paginationDto: any) {
    const queryBuilder = this.ticketRepo
      .createQueryBuilder('ticket')
      .where('ticket.ownerId = :ownerId', { ownerId })
      .orderBy('ticket.createdAt', 'DESC');

    const { paginate } = await import('../common/pagination/pagination.helper');
    return paginate(queryBuilder, paginationDto, 'ticket');
  }

  async issueTicket(paymentId: string): Promise<IssueTicketResponseDto> {
    const payment = await this.paymentsService.getPaymentById(paymentId);

    if (payment.status !== PaymentStatus.CONFIRMED) {
      throw new BadRequestException('Payment not confirmed');
    }

    if (!payment.transactionHash) {
      throw new BadRequestException('Payment has no transaction hash');
    }

    // ── Capacity enforcement ───────────────────────────────────────────────
    const event = await this.eventRepo.findOne({ where: { id: payment.eventId } });
    if (!event) throw new NotFoundException('Event not found');

    if (event.maxAttendees !== null) {
      const soldCount = await this.ticketRepo.count({
        where: { eventId: payment.eventId, status: 'valid' },
      });
      if (soldCount >= event.maxAttendees) {
        throw new BadRequestException('This event is sold out.');
      }
    }

    const existing = await this.ticketRepo.findOne({
      where: { transactionHash: payment.transactionHash },
    });
    if (existing) {
      const signature = this.ticketSigningService.sign(existing.id);
      const qrPayload = JSON.stringify({ ticketId: existing.id, signature });
      const qrCodeDataUrl = await qrcode.toDataURL(qrPayload);
      return {
        ticket: existing,
        signature,
        qrCodeDataUrl,
        ownerId: existing.ownerId,
        assetCode: existing.assetCode,
        status: existing.status,
        transactionHash: existing.transactionHash as string,
      };
    }

    const tx = await this.stellarService.getTransaction(payment.transactionHash);

    const memoValue: string | undefined =
      typeof tx.memo === 'string' ? tx.memo : undefined;

    if (!memoValue) {
      throw new BadRequestException(
        'Transaction is missing memo. Cannot verify payment reference.',
      );
    }

    if (memoValue !== payment.id) {
      throw new BadRequestException(
        `Transaction memo does not match paymentId. Expected "${payment.id}", got "${memoValue}".`,
      );
    }

    const ticket = this.ticketRepo.create({
      eventId: payment.eventId,
      ownerId: payment.userId,
      assetCode: payment.currency,
      transactionHash: payment.transactionHash,
      status: 'valid',
    });

    const saved = await this.ticketRepo.save(ticket);
    const signature = this.ticketSigningService.sign(saved.id);
    const qrPayload = JSON.stringify({ ticketId: saved.id, signature });
    const qrCodeDataUrl = await qrcode.toDataURL(qrPayload);

    const user = await this.userRepo.findOne({ where: { id: payment.userId } });
    if (user && event) {
      await this.notificationService.queueTicketEmail({
        userId: user.id,
        email: user.email,
        ticketId: saved.id,
        eventName: event.title,
      });
    }

    return {
      ticket: saved,
      signature,
      qrCodeDataUrl,
      ownerId: saved.ownerId,
      assetCode: saved.assetCode,
      status: saved.status,
      transactionHash: saved.transactionHash as string,
    };
  }

  async bulkIssueTickets(paymentIds: string[]): Promise<BulkIssueResultDto[]> {
    const results = await Promise.allSettled(
      paymentIds.map((id) => this.issueTicket(id)),
    );
    return results.map((r, i) => ({
      paymentId: paymentIds[i],
      success: r.status === 'fulfilled',
      ticketId: r.status === 'fulfilled' ? r.value.ticket.id : undefined,
      error: r.status === 'rejected' ? (r.reason as Error)?.message : undefined,
    }));
  }

  async regenerateQr(
    ticketId: string,
    requesterId: string,
  ): Promise<{ qrCodeDataUrl: string }> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.ownerId !== requesterId) throw new ForbiddenException();
    if (ticket.status !== 'valid')
      throw new BadRequestException('Ticket is not valid');

    const signature = this.ticketSigningService.sign(ticket.id);
    const qrPayload = JSON.stringify({ ticketId: ticket.id, signature });
    const qrCodeDataUrl = await qrcode.toDataURL(qrPayload);
    return { qrCodeDataUrl };
  }

  async getVerifyStatus(
    ticketId: string,
    signature: string,
  ): Promise<{ valid: boolean; status: string; eventId?: string }> {
    const isValid = this.ticketSigningService.verify(ticketId, signature);
    if (!isValid) return { valid: false, status: 'invalid_signature' };

    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) return { valid: false, status: 'not_found' };

    return {
      valid: ticket.status === 'valid',
      status: ticket.status,
      eventId: ticket.eventId,
    };
  }

  async transferTicket(
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (ticket.ownerId !== callerOwnerId) {
      throw new ForbiddenException('Not ticket owner');
    }

    if (ticket.status !== 'valid') {
      throw new BadRequestException('Ticket not transferable');
    }

    ticket.ownerId = newOwnerId;
    return this.ticketRepo.save(ticket);
  }

  async verifyTicket(ticketId: string, signature: string): Promise<TicketEntity> {
    if (!this.ticketSigningService.verify(ticketId, signature)) {
      throw new UnauthorizedException('Invalid ticket signature');
    }

    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (ticket.status === 'used') {
      throw new BadRequestException('Ticket has already been used');
    }
    if (ticket.status !== 'valid') {
      throw new BadRequestException('Ticket is no longer valid');
    }

    ticket.status = 'used';
    return this.ticketRepo.save(ticket);
  }
}
