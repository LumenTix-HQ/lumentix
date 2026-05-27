import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketEntity } from '../entities/ticket.entity';
import { Event } from '../../events/entities/event.entity';
import { User } from '../../users/entities/user.entity';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/entities/audit-log.entity';
import { NotificationService } from '../../notifications/notification.service';
import { StellarService } from '../../stellar/stellar.service';
import {
  ResaleTransaction,
  ResaleStatus,
} from './resale-transaction.entity';
import { ListTicketForResaleDto } from './dto/list-ticket-resale.dto';
import { BuyResaleTicketDto } from './dto/buy-resale-ticket.dto';

const MAX_RESALE_MULTIPLIER = 1.5; // 150% of original price
const ORGANIZER_FEE_BPS = 500; // 5% = 500 basis points

@Injectable()
export class ResaleService {
  private readonly logger = new Logger(ResaleService.name);

  constructor(
    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ResaleTransaction)
    private readonly resaleTransactionRepo: Repository<ResaleTransaction>,
    private readonly stellarService: StellarService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  async listTicketForResale(
    ticketId: string,
    ownerId: string,
    dto: ListTicketForResaleDto,
  ): Promise<{ isListed: boolean; listingPrice: number; maxAllowedPrice: number }> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.ownerId !== ownerId) throw new ForbiddenException('Not ticket owner');
    if (ticket.status !== 'valid') throw new BadRequestException('Only valid tickets can be listed');
    if (ticket.isListed) throw new BadRequestException('Ticket is already listed');

    const event = await this.eventRepo.findOne({ where: { id: ticket.eventId } });
    if (!event) throw new NotFoundException('Event not found');

    const originalPrice = Number(event.ticketPrice);
    const maxAllowed = originalPrice * MAX_RESALE_MULTIPLIER;

    if (dto.price > maxAllowed) {
      throw new BadRequestException(
        `Resale price cannot exceed ${MAX_RESALE_MULTIPLIER * 100}% of the original ticket price. ` +
        `Original price: ${originalPrice} ${event.currency}, max allowed: ${maxAllowed.toFixed(2)} ${dto.currency}.`,
      );
    }

    ticket.isListed = true;
    ticket.listingPrice = dto.price;
    ticket.listingCurrency = dto.currency;
    ticket.listedAt = new Date();
    await this.ticketRepo.save(ticket);

    await this.auditService.log({
      action: AuditAction.RESALE_LISTED,
      userId: ownerId,
      resourceId: ticketId,
      metadata: { price: dto.price, currency: dto.currency, originalPrice },
    });

    return {
      isListed: true,
      listingPrice: dto.price,
      maxAllowedPrice: maxAllowed,
    };
  }

  async buyResaleTicket(
    ticketId: string,
    buyerId: string,
    dto: BuyResaleTicketDto,
  ): Promise<{
    ticket: TicketEntity;
    salePrice: number;
    organizerFee: number;
    sellerPayout: number;
  }> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (!ticket.isListed) throw new BadRequestException('Ticket is not listed for resale');
    if (ticket.ownerId === buyerId) throw new BadRequestException('Cannot buy your own ticket');

    const event = await this.eventRepo.findOne({ where: { id: ticket.eventId } });
    if (!event) throw new NotFoundException('Associated event not found');

    const sellerId = ticket.ownerId;
    const salePrice = Number(ticket.listingPrice);
    const originalPrice = Number(event.ticketPrice);

    const maxAllowed = originalPrice * MAX_RESALE_MULTIPLIER;
    if (salePrice > maxAllowed) {
      throw new BadRequestException(
        'This listing exceeds the maximum allowed resale price and has been invalidated.',
      );
    }

    const organizerFee = parseFloat((salePrice * (ORGANIZER_FEE_BPS / 10000)).toFixed(7));
    const sellerPayout = parseFloat((salePrice - organizerFee).toFixed(7));

    let txRecord: Awaited<ReturnType<StellarService['getTransaction']>>;
    try {
      txRecord = await this.stellarService.getTransaction(dto.transactionHash);
    } catch {
      throw new BadRequestException('Transaction not found on Stellar network');
    }

    const operations = await this.resolvePaymentOperations(txRecord);
    const sellerWallet = await this.userRepo
      .findOne({ where: { id: sellerId }, select: ['stellarPublicKey'] })
      .then((u) => u?.stellarPublicKey);

    if (!sellerWallet) throw new BadRequestException('Seller has no linked Stellar wallet');

    const matchingOp = operations.find((op) => op.to === sellerWallet);
    if (!matchingOp) throw new BadRequestException('Payment destination does not match seller wallet');

    const onChainAmount = parseFloat(matchingOp.amount);
    if (Math.abs(onChainAmount - salePrice) > 0.0000001) {
      throw new BadRequestException(
        `Incorrect payment amount. Expected ${salePrice}, received ${onChainAmount}.`,
      );
    }

    const previousOwnerId = ticket.ownerId;
    ticket.ownerId = buyerId;
    ticket.isListed = false;
    ticket.listingPrice = null;
    ticket.listingCurrency = null;
    ticket.listedAt = null;
    const savedTicket = await this.ticketRepo.save(ticket);

    const resaleTx = this.resaleTransactionRepo.create({
      ticketId: ticket.id,
      eventId: ticket.eventId,
      sellerId: previousOwnerId,
      buyerId,
      salePrice,
      currency: ticket.listingCurrency ?? 'XLM',
      originalPrice,
      organizerFee,
      sellerPayout,
      status: ResaleStatus.COMPLETED,
      transactionHash: dto.transactionHash,
    });
    await this.resaleTransactionRepo.save(resaleTx);

    await this.auditService.log({
      action: AuditAction.RESALE_BOUGHT,
      userId: buyerId,
      resourceId: ticket.id,
      metadata: {
        salePrice,
        organizerFee,
        sellerPayout,
        resaleTransactionId: resaleTx.id,
      },
    });

    const seller = await this.userRepo.findOne({ where: { id: previousOwnerId } });
    if (seller) {
      await this.notificationService.queueTicketSoldEmail({
        email: seller.email,
        ticketId: ticket.id,
        amount: sellerPayout,
        currency: ticket.listingCurrency ?? 'XLM',
      });
    }

    return {
      ticket: savedTicket,
      salePrice,
      organizerFee,
      sellerPayout,
    };
  }

  async cancelResaleListing(
    ticketId: string,
    ownerId: string,
  ): Promise<{ cancelled: boolean }> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.ownerId !== ownerId) throw new ForbiddenException('Not ticket owner');
    if (!ticket.isListed) throw new BadRequestException('Ticket is not listed for resale');

    ticket.isListed = false;
    ticket.listingPrice = null;
    ticket.listingCurrency = null;
    ticket.listedAt = null;
    await this.ticketRepo.save(ticket);

    await this.auditService.log({
      action: AuditAction.RESALE_CANCELLED,
      userId: ownerId,
      resourceId: ticketId,
    });

    return { cancelled: true };
  }

  async getResaleHistory(
    ticketId: string,
  ): Promise<ResaleTransaction[]> {
    return this.resaleTransactionRepo.find({
      where: { ticketId },
      order: { createdAt: 'DESC' },
    });
  }

  async getOrganizerResaleEarnings(
    organizerId: string,
  ): Promise<{ totalEarnings: number; transactions: number }> {
    const events = await this.eventRepo.find({
      where: { organizerId },
      select: ['id'],
    });

    if (events.length === 0) {
      return { totalEarnings: 0, transactions: 0 };
    }

    const eventIds = events.map((e) => e.id);
    const result = await this.resaleTransactionRepo
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.organizerFee), 0)', 'totalEarnings')
      .addSelect('COUNT(*)', 'transactions')
      .where('r.eventId IN (:...eventIds)', { eventIds })
      .getRawOne();

    return {
      totalEarnings: Number(result?.totalEarnings ?? 0),
      transactions: Number(result?.transactions ?? 0),
    };
  }

  private async resolvePaymentOperations(
    txRecord: Awaited<ReturnType<StellarService['getTransaction']>>,
  ): Promise<Array<{ type: string; to: string; amount: string; asset_type: string; asset_code?: string }>> {
    try {
      const operationsHref = (txRecord as any)._links?.operations?.href;
      if (!operationsHref) return [];
      const response = await fetch(operationsHref);
      if (!response.ok) return [];
      const payload = (await response.json()) as { _embedded: { records: any[] } };
      return payload._embedded.records.filter(
        (operation: any) => operation.type === 'payment' || operation.type === 'create_account',
      );
    } catch {
      return [];
    }
  }
}
