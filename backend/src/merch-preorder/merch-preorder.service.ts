import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MerchVariant } from './entities/merch-variant.entity';
import { MerchPreorder } from './entities/merch-preorder.entity';
import { CreateMerchVariantDto } from './dto/create-merch-variant.dto';
import { CreateMerchPreorderDto } from './dto/create-merch-preorder.dto';
import { MerchService } from '../merch/merch.service';
import { TicketsService } from '../tickets/tickets.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class MerchPreorderService {
  constructor(
    @InjectRepository(MerchVariant)
    private readonly variantRepository: Repository<MerchVariant>,
    @InjectRepository(MerchPreorder)
    private readonly preorderRepository: Repository<MerchPreorder>,
    private readonly merchService: MerchService,
    private readonly ticketsService: TicketsService,
    private readonly eventsService: EventsService,
  ) {}

  async createMerchVariant(
    merchItemId: string,
    dto: CreateMerchVariantDto,
    requesterId: string,
  ): Promise<MerchVariant> {
    const merchItem = await this.merchService.getMerchItemById(merchItemId);
    await this.assertOrganizer(merchItem.eventId, requesterId);

    const variant = this.variantRepository.create({
      merchItemId,
      size: dto.size ?? null,
      color: dto.color ?? null,
      stockTotal: dto.stockTotal,
    });
    return this.variantRepository.save(variant);
  }

  async listVariants(merchItemId: string): Promise<MerchVariant[]> {
    return this.variantRepository.find({ where: { merchItemId } });
  }

  async reserveVariantStock(variantId: string, quantity: number): Promise<MerchVariant> {
    const variant = await this.getVariantById(variantId);
    const available = variant.stockTotal - variant.stockReserved;
    if (quantity > available) {
      throw new BadRequestException('Not enough stock available for this variant');
    }
    variant.stockReserved += quantity;
    return this.variantRepository.save(variant);
  }

  async createMerchPreorder(
    dto: CreateMerchPreorderDto,
    buyerId: string,
  ): Promise<MerchPreorder> {
    const variant = await this.getVariantById(dto.variantId);
    const quantity = dto.quantity ?? 1;

    const ticket = await this.ticketsService.getTicketById(dto.ticketId);
    if (ticket.ownerId !== buyerId) {
      throw new ForbiddenException('Only the ticket holder can pre-order with this ticket');
    }

    await this.reserveVariantStock(variant.id, quantity);

    const preorder = this.preorderRepository.create({
      variantId: variant.id,
      ticketId: dto.ticketId,
      buyerId,
      quantity,
      status: 'reserved',
    });
    return this.preorderRepository.save(preorder);
  }

  async confirmPreorderPickup(
    preorderId: string,
    requesterId: string,
  ): Promise<MerchPreorder> {
    const preorder = await this.preorderRepository.findOne({
      where: { id: preorderId },
      relations: ['variant'],
    });
    if (!preorder) {
      throw new NotFoundException(`Pre-order "${preorderId}" not found`);
    }

    const merchItem = await this.merchService.getMerchItemById(preorder.variant.merchItemId);
    await this.assertOrganizer(merchItem.eventId, requesterId);

    if (preorder.status !== 'reserved') {
      throw new BadRequestException('Only reserved pre-orders can be picked up');
    }

    preorder.status = 'picked_up';
    preorder.pickedUpAt = new Date();
    return this.preorderRepository.save(preorder);
  }

  async getVariantById(id: string): Promise<MerchVariant> {
    const variant = await this.variantRepository.findOne({ where: { id } });
    if (!variant) throw new NotFoundException(`Merchandise variant "${id}" not found`);
    return variant;
  }

  private async assertOrganizer(eventId: string, requesterId: string): Promise<void> {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== requesterId) {
      throw new ForbiddenException('Only the event organizer can manage merchandise pre-orders');
    }
  }
}
