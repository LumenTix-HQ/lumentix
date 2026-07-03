import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  Inject,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as qrcode from 'qrcode';

import { TicketEntity } from './entities/ticket.entity';
import { TicketSigningService } from './ticket-signing.service';
import { TicketPdfService } from './ticket-pdf.service';
import { IssueTicketResponseDto } from './dto/issue-ticket-response.dto';
import { BulkIssueResultDto } from './dto/bulk-issue-result.dto';
import { ConfirmTransferDto } from './dto/confirm-transfer.dto';
import { TransferTicketDto } from './dto/transfer-ticket.dto';
import { PaymentsService } from '../payments/payments.service';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { Event } from '../events/entities/event.entity';
import { EventSeries } from '../events/entities/event-series.entity';
import { StellarService } from '../stellar/stellar.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { paginate } from '../common/pagination/pagination.helper';
import { User } from '../users/entities/user.entity';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
    private readonly stellarService: StellarService,
    private readonly configService: ConfigService,
    private readonly ticketSigningService: TicketSigningService,
    private readonly ticketPdfService: TicketPdfService,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    @InjectRepository(EventSeries)
    private readonly eventSeriesRepo: Repository<EventSeries>,
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
      .leftJoinAndMapOne('ticket.event', Event, 'event', 'event.id = ticket.eventId')
      .leftJoinAndMapOne('ticket.payment', Payment, 'payment', 'payment.transactionHash = ticket.transactionHash')
      .where('ticket.ownerId = :ownerId', { ownerId })
      .orderBy('ticket.createdAt', 'DESC');

    if (paginationDto?.status) {
      queryBuilder.andWhere('ticket.status = :status', { status: paginationDto.status });
    }

    const result = await paginate(queryBuilder, paginationDto, 'ticket');

    const now = new Date();
    const enriched = result.data.map((ticket: any) => ({
      ...ticket,
      isExpired:
        ticket.status === 'valid' &&
        ticket.event?.endDate instanceof Date &&
        ticket.event.endDate < now,
    }));

    return { ...result, data: enriched };
  }

  async issueTicket(paymentId: string): Promise<IssueTicketResponseDto> {
    const payment = await this.paymentsService.getPaymentById(paymentId);

    if (payment.status !== PaymentStatus.CONFIRMED) {
      throw new BadRequestException('Payment not confirmed');
    }

    if (!payment.transactionHash) {
      throw new BadRequestException('Payment has no transaction hash');
    }

    const tx = await this.stellarService.getTransaction(payment.transactionHash);
    const memoValue: string | undefined = typeof tx.memo === 'string' ? tx.memo : undefined;

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

    const user = await this.userRepo.findOne({ where: { id: payment.userId } });
    if (!user) throw new NotFoundException('User not found');

    if (payment.isSeasonPass) {
      const events = await this.eventRepo.find({ where: { seriesId: payment.seriesId as string } });
      if (events.length === 0) throw new BadRequestException('No events found for this series');

      const tickets: TicketEntity[] = [];
      for (const event of events) {
        let ticket = await this.ticketRepo.findOne({
          where: { transactionHash: payment.transactionHash, eventId: event.id },
        });

        if (!ticket) {
          ticket = this.ticketRepo.create({
            eventId: event.id,
            ownerId: payment.userId,
            assetCode: payment.currency,
            transactionHash: payment.transactionHash,
            status: 'valid',
          });
          ticket = await this.ticketRepo.save(ticket);

          const signature = this.ticketSigningService.sign(ticket.id);
          const qrPayload = JSON.stringify({ ticketId: ticket.id, signature });
          const qrCodeDataUrl = await qrcode.toDataURL(qrPayload);

          let pdfUrl: string | null = null;
          try {
            pdfUrl = await this.ticketPdfService.generate(
              ticket,
              event,
              user.email,
              qrCodeDataUrl,
            );
            ticket.pdfUrl = pdfUrl;
            await this.ticketRepo.save(ticket);
          } catch (err) {
            // PDF generation non-fatal
          }

          await this.notificationService.queueTicketEmail({
            userId: user.id,
            email: user.email,
            ticketId: ticket.id,
            eventName: event.title,
            pdfUrl: pdfUrl ?? undefined,
          });
        }
        tickets.push(ticket);
      }

      const firstTicket = tickets[0];
      const signature = this.ticketSigningService.sign(firstTicket.id);
      const qrPayload = JSON.stringify({ ticketId: firstTicket.id, signature });
      const qrCodeDataUrl = await qrcode.toDataURL(qrPayload);

      return {
        ticket: firstTicket,
        signature,
        qrCodeDataUrl,
        pdfUrl: firstTicket.pdfUrl,
        ownerId: firstTicket.ownerId,
        assetCode: firstTicket.assetCode,
        status: firstTicket.status,
        transactionHash: firstTicket.transactionHash as string,
      };
    } else {
      const event = await this.eventRepo.findOne({ where: { id: payment.eventId as string } });
      if (!event) throw new NotFoundException('Event not found');

      if (event.maxAttendees !== null) {
        const soldCount = await this.ticketRepo.count({
          where: { eventId: payment.eventId as string, status: 'valid' },
        });
        if (soldCount >= event.maxAttendees) {
          throw new BadRequestException('This event is sold out.');
        }
      }

      let ticket = await this.ticketRepo.findOne({
        where: { transactionHash: payment.transactionHash, eventId: payment.eventId as string },
      });

      if (!ticket) {
        ticket = this.ticketRepo.create({
          eventId: payment.eventId as string,
          ownerId: payment.userId,
          assetCode: payment.currency,
          transactionHash: payment.transactionHash,
          status: 'valid',
        });
        ticket = await this.ticketRepo.save(ticket);

        const signature = this.ticketSigningService.sign(ticket.id);
        const qrPayload = JSON.stringify({ ticketId: ticket.id, signature });
        const qrCodeDataUrl = await qrcode.toDataURL(qrPayload);

        let pdfUrl: string | null = null;
        try {
          pdfUrl = await this.ticketPdfService.generate(
            ticket,
            event,
            user.email,
            qrCodeDataUrl,
          );
          ticket.pdfUrl = pdfUrl;
          await this.ticketRepo.save(ticket);
        } catch (err) {
          // PDF generation non-fatal
        }

        await this.notificationService.queueTicketEmail({
          userId: user.id,
          email: user.email,
          ticketId: ticket.id,
          eventName: event.title,
          pdfUrl: pdfUrl ?? undefined,
        });
      }

      const signature = this.ticketSigningService.sign(ticket.id);
      const qrPayload = JSON.stringify({ ticketId: ticket.id, signature });
      const qrCodeDataUrl = await qrcode.toDataURL(qrPayload);

      return {
        ticket,
        signature,
        qrCodeDataUrl,
        pdfUrl: ticket.pdfUrl,
        ownerId: ticket.ownerId,
        assetCode: ticket.assetCode,
        status: ticket.status,
        transactionHash: ticket.transactionHash as string,
      };
    }
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
    ticketId: string,
    callerOwnerId: string,
    newOwnerId: string,
  ): Promise<TicketEntity> {
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

  /**
   * Transfer a ticket to a new owner, recording the transfer on-chain (Stellar)
   * and writing an audit event. The DB update is rolled back if Stellar fails.
   */
  async initiateTransfer(
    ticketId: string,
    requesterId: string,
    dto: TransferTicketDto,
  ): Promise<{ xdr: string }> {
    // ── Validate ─────────────────────────────────────────────────────────────
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (ticket.ownerId !== requesterId) {
      throw new ForbiddenException('You do not own this ticket');
    }

    if (ticket.status !== 'valid') {
      throw new BadRequestException(
        `Ticket cannot be transferred (status: ${ticket.status})`,
      );
    }

    // Prevent double-transfer by checking transfer history for this recipient
    const alreadyTransferred = ticket.transferHistory?.some(
      (h) => h.to === dto.recipientUserId,
    );
    if (alreadyTransferred) {
      throw new BadRequestException(
        'Ticket has already been transferred to this recipient',
      );
    }

    // Ensure the event has not already started
    const event = await this.eventRepo.findOne({ where: { id: ticket.eventId } });
    if (!event) throw new NotFoundException('Associated event not found');

    if (new Date(event.startDate) <= new Date()) {
      throw new BadRequestException(
        'Cannot transfer a ticket after the event has started',
      );
    }

    const recipient = await this.userRepo.findOne({ where: { id: dto.recipientUserId } });
    if (!recipient) throw new NotFoundException('Recipient user not found');
    if (!recipient.stellarPublicKey) {
      throw new BadRequestException('Recipient does not have a linked Stellar wallet.');
    }

    if (recipient.stellarPublicKey !== dto.recipientPublicKey) {
      throw new BadRequestException('Recipient public key does not match the one on file.');
    }

    const xdr = await this.stellarService.buildTicketTransferXdr({
      sourcePublicKey: ticket.ownerPublicKey as string,
      destPublicKey: dto.recipientPublicKey,
      assetCode: ticket.assetCode,
      assetIssuer: event.escrowPublicKey as string,
    });

    return { xdr };
  }

  async confirmTransfer(
    ticketId: string,
    requesterId: string,
    dto: ConfirmTransferDto,
  ): Promise<TicketEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (ticket.ownerId !== requesterId) {
      throw new ForbiddenException('You do not own this ticket');
    }

    const tx = await this.stellarService.getTransaction(dto.transactionHash);

    const event = await this.eventRepo.findOne({ where: { id: ticket.eventId } });
    if (!event) throw new NotFoundException('Associated event not found');

    const recipient = await this.userRepo.findOne({ where: { id: ticket.transferHistory[ticket.transferHistory.length - 1].to } });
    if (!recipient) throw new NotFoundException('Recipient user not found');

    // ── Validate On-Chain Transaction ────────────────────────────────────────
    const ops = await this.stellarService.getTransactionOperations(dto.transactionHash);
    if (ops.length !== 1) {
      throw new BadRequestException('Transaction must have exactly one operation.');
    }

    const op = ops[0];
    if (op.type !== 'payment') {
      throw new BadRequestException('Transaction must be a payment operation.');
    }

    if (op.asset_code !== ticket.assetCode) {
      throw new BadRequestException('Transaction asset code does not match ticket.');
    }

    if (op.asset_issuer !== event.escrowPublicKey) {
      throw new BadRequestException('Transaction asset issuer does not match event escrow.');
    }

    if (op.to !== recipient.stellarPublicKey) {
      throw new BadRequestException('Transaction destination does not match recipient.');
    }

    if (op.from !== ticket.ownerPublicKey) {
      throw new BadRequestException('Transaction source does not match original owner.');
    }

    if (op.amount !== '0.0000001') {
      throw new BadRequestException('Transaction amount is incorrect for a ticket transfer.');
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Basic validation, more can be added here (e.g. checking operations)
    if (!tx) {
      throw new BadRequestException('Transaction not found on-chain.');
    }


    const previousOwnerId = ticket.ownerId;
    const saved = await this.dataSource.transaction(async (em) => {
      ticket.ownerId = recipient.id;
      ticket.ownerPublicKey = recipient.stellarPublicKey;
      ticket.transferHistory = [
        ...(ticket.transferHistory ?? []),
        {
          from: previousOwnerId,
          to: recipient.id,
          timestamp: new Date().toISOString(),
        },
      ];
      return em.save(TicketEntity, ticket);
    });

    await this.auditService.log({
      action: 'TICKET_TRANSFERRED' as any,
      userId: requesterId,
      resourceId: ticketId,
      meta: {
        from: previousOwnerId,
        to: recipient.id,
        recipientPublicKey: recipient.stellarPublicKey,
        eventId: ticket.eventId,
        transactionHash: dto.transactionHash,
      },
    });

    return saved;
  }

  /**
   * Push a transfer history record onto a ticket's persistent transfer log.
   * Creates the history array if it doesn't exist yet.
   */
  async appendTicketTransferHistory(
    ticketId: string,
    from: string,
    to: string,
  ): Promise<TicketEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    ticket.transferHistory = [
      ...(ticket.transferHistory ?? []),
      { from, to, timestamp: new Date().toISOString() },
    ];

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

  // ── Resale / marketplace ──────────────────────────────────────────────────

  async listTicketForSale(
    ticketId: string,
    ownerId: string,
    price: number,
    currency: string,
  ): Promise<TicketEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.ownerId !== ownerId) throw new ForbiddenException();
    if (ticket.status !== 'valid') throw new BadRequestException('Only valid tickets can be listed');
    if (ticket.isListed) throw new BadRequestException('Ticket is already listed');

    ticket.isListed = true;
    ticket.listingPrice = price;
    ticket.listingCurrency = currency;
    return this.ticketRepo.save(ticket);
  }

  async cancelListing(ticketId: string, ownerId: string): Promise<TicketEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.ownerId !== ownerId) throw new ForbiddenException();

    ticket.isListed = false;
    ticket.listingPrice = null;
    ticket.listingCurrency = null;
    return this.ticketRepo.save(ticket);
  }

  async getMarketplace() {
    return this.ticketRepo.find({
      where: { isListed: true, status: 'valid' },
      order: { createdAt: 'DESC' },
    });
  }

  async buyTicket(
    ticketId: string,
    buyerId: string,
    transactionHash: string,
  ): Promise<TicketEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (!ticket.isListed) throw new BadRequestException('Ticket is not listed for sale');
    if (ticket.ownerId === buyerId) throw new BadRequestException('Cannot buy your own ticket');

    // Verify on-chain payment
    let txRecord: Awaited<ReturnType<StellarService['getTransaction']>>;
    try {
      txRecord = await this.stellarService.getTransaction(transactionHash);
    } catch {
      throw new BadRequestException('Transaction not found on Stellar network');
    }

    const ops = await this.resolvePaymentOps(txRecord);
    const sellerWallet = await this.userRepo
      .findOne({ where: { id: ticket.ownerId }, select: ['stellarPublicKey'] })
      .then((u) => u?.stellarPublicKey);

    if (!sellerWallet) throw new BadRequestException('Seller has no linked Stellar wallet');

    const matchingOp = ops.find((op) => op.to === sellerWallet);
    if (!matchingOp) throw new BadRequestException('Payment destination does not match seller wallet');

    const onChainAmount = parseFloat(matchingOp.amount);
    const expectedAmount = Number(ticket.listingPrice);
    if (Math.abs(onChainAmount - expectedAmount) > 0.0000001) {
      throw new BadRequestException(
        `Incorrect payment amount. Expected ${expectedAmount}, received ${onChainAmount}.`,
      );
    }

    const previousOwnerId = ticket.ownerId;
    ticket.ownerId = buyerId;
    ticket.isListed = false;
    ticket.listingPrice = null;
    ticket.listingCurrency = null;
    const saved = await this.ticketRepo.save(ticket);

    // Notify previous owner
    const seller = await this.userRepo.findOne({ where: { id: previousOwnerId } });
    if (seller) {
      await this.notificationService.queueTicketSoldEmail({
        email: seller.email,
        ticketId: ticket.id,
        amount: onChainAmount,
        currency: ticket.listingCurrency ?? 'XLM',
      });
    }

    return saved;
  }

  async getTicketById(id: string): Promise<TicketEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    return ticket;
  }

  private async resolvePaymentOps(
    txRecord: Awaited<ReturnType<StellarService['getTransaction']>>,
  ): Promise<Array<{ type: string; to: string; amount: string; asset_type: string; asset_code?: string }>> {
    try {
      const opsHref = txRecord._links.operations?.href;
      if (!opsHref) return [];
      const res = await fetch(opsHref);
      if (!res.ok) return [];
      const json = (await res.json()) as { _embedded: { records: any[] } };
      return json._embedded.records.filter(
        (op) => op.type === 'payment' || op.type === 'create_account',
      );
    } catch {
      return [];
    }
  }
}