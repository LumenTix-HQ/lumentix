import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MerchItem } from './entities/merch-item.entity';
import {
  MerchReservation,
  MerchReservationStatus,
} from './entities/merch-reservation.entity';
import { CreateMerchItemDto } from './dto/create-merch-item.dto';
import { PurchaseMerchDto } from './dto/purchase-merch.dto';
import { EventsService } from '../events/events.service';
import { TicketsService } from '../tickets/tickets.service';
import { VipService } from '../vip/vip.service';

export interface TokenGateEligibilityResult {
  eligible: boolean;
  reason?: string;
}

@Injectable()
export class MerchService {
  constructor(
    @InjectRepository(MerchItem)
    private readonly merchItemRepository: Repository<MerchItem>,
    @InjectRepository(MerchReservation)
    private readonly reservationRepository: Repository<MerchReservation>,
    private readonly eventsService: EventsService,
    private readonly ticketsService: TicketsService,
    private readonly vipService: VipService,
  ) {}

  async createMerchItem(
    eventId: string,
    dto: CreateMerchItemDto,
    requesterId: string,
  ): Promise<MerchItem> {
    await this.assertOrganizer(eventId, requesterId);

    const item = this.merchItemRepository.create({
      ...dto,
      eventId,
      currency: dto.currency ?? 'USD',
      isTokenGated: dto.isTokenGated ?? false,
      gateType: dto.isTokenGated ? dto.gateType ?? null : null,
      requiredAssetCode: dto.gateType === 'ticket_nft' ? dto.requiredAssetCode ?? null : null,
      requiredVipTier: dto.gateType === 'vip_badge' ? dto.requiredVipTier ?? null : null,
    });
    return this.merchItemRepository.save(item);
  }

  async listMerchItems(eventId: string): Promise<MerchItem[]> {
    return this.merchItemRepository.find({ where: { eventId } });
  }

  async verifyTokenGateEligibility(
    merchItemId: string,
    buyerId: string,
    proof: PurchaseMerchDto,
  ): Promise<TokenGateEligibilityResult> {
    const merchItem = await this.getMerchItemById(merchItemId);

    if (!merchItem.isTokenGated) {
      return { eligible: true };
    }

    if (merchItem.gateType === 'ticket_nft') {
      if (!proof.ticketId) {
        return { eligible: false, reason: 'A ticket id is required to verify token-gate eligibility' };
      }
      const ticket = await this.ticketsService.getTicketById(proof.ticketId);
      if (ticket.ownerId !== buyerId) {
        return { eligible: false, reason: 'Ticket is not owned by the buyer' };
      }
      if (ticket.eventId !== merchItem.eventId) {
        return { eligible: false, reason: 'Ticket does not belong to this event' };
      }
      if (ticket.assetCode !== merchItem.requiredAssetCode) {
        return { eligible: false, reason: `Requires ticket NFT "${merchItem.requiredAssetCode}"` };
      }
      return { eligible: true };
    }

    if (merchItem.gateType === 'vip_badge') {
      if (!proof.vipTicketId) {
        return { eligible: false, reason: 'A VIP ticket id is required to verify token-gate eligibility' };
      }
      const ticket = await this.ticketsService.getTicketById(proof.vipTicketId);
      if (ticket.ownerId !== buyerId) {
        return { eligible: false, reason: 'Ticket is not owned by the buyer' };
      }
      const hasAccess = await this.vipService.validateAccess(
        proof.vipTicketId,
        merchItem.requiredVipTier as string,
      );
      if (!hasAccess) {
        return { eligible: false, reason: `Requires VIP tier "${merchItem.requiredVipTier}" badge` };
      }
      return { eligible: true };
    }

    return { eligible: false, reason: 'Unsupported token gate type' };
  }

  async restrictMerchPurchase(
    merchItemId: string,
    buyerId: string,
    proof: PurchaseMerchDto,
  ): Promise<MerchReservation> {
    const merchItem = await this.getMerchItemById(merchItemId);

    const eligibility = await this.verifyTokenGateEligibility(merchItemId, buyerId, proof);
    if (!eligibility.eligible) {
      throw new ForbiddenException(eligibility.reason ?? 'Not eligible to purchase this item');
    }

    if (merchItem.reservedStock >= merchItem.totalStock) {
      throw new BadRequestException('Merchandise item is out of stock');
    }

    merchItem.reservedStock += 1;
    await this.merchItemRepository.save(merchItem);

    const reservation = this.reservationRepository.create({
      merchItemId,
      buyerId,
      proofId: proof.ticketId ?? proof.vipTicketId ?? null,
      status: 'reserved' as MerchReservationStatus,
    });
    return this.reservationRepository.save(reservation);
  }

  async releaseTokenGate(
    reservationId: string,
    requesterId: string,
  ): Promise<MerchReservation> {
    const reservation = await this.reservationRepository.findOne({
      where: { id: reservationId },
      relations: ['merchItem'],
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation "${reservationId}" not found`);
    }

    if (reservation.status !== 'reserved') {
      throw new BadRequestException('Only reserved holds can be released');
    }

    const isBuyer = reservation.buyerId === requesterId;
    if (!isBuyer) {
      await this.assertOrganizer(reservation.merchItem.eventId, requesterId);
    }

    reservation.status = 'released';
    reservation.releasedAt = new Date();

    reservation.merchItem.reservedStock = Math.max(
      0,
      reservation.merchItem.reservedStock - 1,
    );
    await this.merchItemRepository.save(reservation.merchItem);

    return this.reservationRepository.save(reservation);
  }

  async getMerchItemById(id: string): Promise<MerchItem> {
    const item = await this.merchItemRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Merchandise item "${id}" not found`);
    return item;
  }

  private async assertOrganizer(eventId: string, requesterId: string): Promise<void> {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== requesterId) {
      throw new ForbiddenException('Only the event organizer can manage merchandise');
    }
  }
}
