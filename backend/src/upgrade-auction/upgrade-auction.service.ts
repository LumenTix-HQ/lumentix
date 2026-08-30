import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpgradeAuction } from './entities/upgrade-auction.entity';
import { UpgradeBid } from './entities/upgrade-bid.entity';
import { OpenUpgradeAuctionDto } from './dto/open-upgrade-auction.dto';
import { PlaceUpgradeBidDto } from './dto/place-upgrade-bid.dto';
import { EventsService } from '../events/events.service';
import { TicketsService } from '../tickets/tickets.service';

export interface FinalizedAuctionResult {
  auction: UpgradeAuction;
  winningBids: UpgradeBid[];
}

@Injectable()
export class UpgradeAuctionService {
  constructor(
    @InjectRepository(UpgradeAuction)
    private readonly auctionRepository: Repository<UpgradeAuction>,
    @InjectRepository(UpgradeBid)
    private readonly bidRepository: Repository<UpgradeBid>,
    private readonly eventsService: EventsService,
    private readonly ticketsService: TicketsService,
  ) {}

  async openUpgradeAuction(
    eventId: string,
    dto: OpenUpgradeAuctionDto,
    requesterId: string,
  ): Promise<UpgradeAuction> {
    await this.assertOrganizer(eventId, requesterId);

    const opensAt = dto.opensAt ? new Date(dto.opensAt) : null;
    const closesAt = new Date(dto.closesAt);
    if (closesAt.getTime() <= Date.now()) {
      throw new BadRequestException('Auction close time must be in the future');
    }
    if (opensAt && opensAt.getTime() >= closesAt.getTime()) {
      throw new BadRequestException('Auction open time must be before the close time');
    }

    const auction = this.auctionRepository.create({
      eventId,
      seatTier: dto.seatTier,
      slotsAvailable: dto.slotsAvailable,
      startingPrice: dto.startingPrice,
      minIncrement: dto.minIncrement,
      currency: dto.currency ?? 'USD',
      opensAt,
      closesAt,
      status: 'open',
    });
    return this.auctionRepository.save(auction);
  }

  async placeUpgradeBid(
    auctionId: string,
    dto: PlaceUpgradeBidDto,
    bidderId: string,
  ): Promise<UpgradeBid> {
    const auction = await this.getAuctionById(auctionId);

    if (auction.status !== 'open') {
      throw new BadRequestException('This auction is no longer accepting bids');
    }
    const now = Date.now();
    if (auction.opensAt && now < auction.opensAt.getTime()) {
      throw new BadRequestException('Bidding has not opened for this auction yet');
    }
    if (now >= auction.closesAt.getTime()) {
      throw new BadRequestException('Bidding has closed for this auction');
    }

    const ticket = await this.ticketsService.getTicketById(dto.ticketId);
    if (ticket.ownerId !== bidderId) {
      throw new ForbiddenException('Only the ticket holder can bid to upgrade this ticket');
    }
    if (ticket.eventId !== auction.eventId) {
      throw new BadRequestException('Ticket does not belong to this event');
    }

    const highestBid = await this.bidRepository.findOne({
      where: { auctionId, status: 'active' },
      order: { amount: 'DESC' },
    });
    const minRequired = highestBid
      ? Number(highestBid.amount) + Number(auction.minIncrement)
      : Number(auction.startingPrice);
    if (dto.amount < minRequired) {
      throw new BadRequestException(`Bid must be at least ${minRequired}`);
    }

    await this.bidRepository.update(
      { auctionId, ticketId: dto.ticketId, status: 'active' },
      { status: 'outbid' },
    );

    const bid = this.bidRepository.create({
      auctionId,
      ticketId: dto.ticketId,
      bidderId,
      amount: dto.amount,
      status: 'active',
    });
    return this.bidRepository.save(bid);
  }

  async finalizeWinningBid(
    auctionId: string,
    requesterId: string,
  ): Promise<FinalizedAuctionResult> {
    const auction = await this.getAuctionById(auctionId);
    await this.assertOrganizer(auction.eventId, requesterId);

    if (auction.status !== 'open') {
      throw new BadRequestException('This auction has already been finalized or cancelled');
    }

    const activeBids = await this.bidRepository.find({
      where: { auctionId, status: 'active' },
      order: { amount: 'DESC', placedAt: 'ASC' },
    });

    const winningBids = activeBids.slice(0, auction.slotsAvailable);
    const losingBids = activeBids.slice(auction.slotsAvailable);

    for (const bid of winningBids) {
      bid.status = 'won';
    }
    for (const bid of losingBids) {
      bid.status = 'lost';
    }
    await this.bidRepository.save([...winningBids, ...losingBids]);

    auction.slotsAwarded = winningBids.length;
    auction.status = 'finalized';
    auction.finalizedAt = new Date();
    await this.auctionRepository.save(auction);

    return { auction, winningBids };
  }

  async listAuctions(eventId: string): Promise<UpgradeAuction[]> {
    return this.auctionRepository.find({ where: { eventId } });
  }

  async listBidsForAuction(auctionId: string): Promise<UpgradeBid[]> {
    await this.getAuctionById(auctionId);
    return this.bidRepository.find({
      where: { auctionId },
      order: { amount: 'DESC' },
    });
  }

  async getAuctionById(id: string): Promise<UpgradeAuction> {
    const auction = await this.auctionRepository.findOne({ where: { id } });
    if (!auction) throw new NotFoundException(`Upgrade auction "${id}" not found`);
    return auction;
  }

  private async assertOrganizer(eventId: string, requesterId: string): Promise<void> {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== requesterId) {
      throw new ForbiddenException('Only the event organizer can manage upgrade auctions');
    }
  }
}
