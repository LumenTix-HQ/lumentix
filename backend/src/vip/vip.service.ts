import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VipTier } from './entities/vip-tier.entity';
import { VipAssignment } from './entities/vip-assignment.entity';
import { CreateVipTierDto } from './dto/create-vip-tier.dto';
import { UpdateVipTierDto } from './dto/update-vip-tier.dto';
import { EventsService } from '../events/events.service';
import { TicketsService } from '../tickets/tickets.service';

@Injectable()
export class VipService {
  constructor(
    @InjectRepository(VipTier)
    private readonly tierRepository: Repository<VipTier>,
    @InjectRepository(VipAssignment)
    private readonly assignmentRepository: Repository<VipAssignment>,
    private readonly eventsService: EventsService,
    private readonly ticketsService: TicketsService,
  ) {}

  async createTier(eventId: string, dto: CreateVipTierDto, requesterId: string): Promise<VipTier> {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== requesterId) {
      throw new ForbiddenException('Only the event organizer can create VIP tiers');
    }

    const existing = await this.tierRepository.findOne({ where: { eventId, name: dto.name } });
    if (existing) {
      throw new BadRequestException(`VIP tier "${dto.name}" already exists for this event`);
    }

    const tier = this.tierRepository.create({
      ...dto,
      eventId,
      benefits: dto.benefits ?? [],
    });
    return this.tierRepository.save(tier);
  }

  async updateTier(id: string, dto: UpdateVipTierDto, requesterId: string): Promise<VipTier> {
    const tier = await this.getTierById(id);
    await this.assertOrganizer(tier.eventId, requesterId);
    Object.assign(tier, dto);
    return this.tierRepository.save(tier);
  }

  async deleteTier(id: string, requesterId: string): Promise<void> {
    const tier = await this.getTierById(id);
    await this.assertOrganizer(tier.eventId, requesterId);
    await this.tierRepository.remove(tier);
  }

  async listTiers(eventId: string): Promise<VipTier[]> {
    return this.tierRepository.find({
      where: { eventId },
      order: { price: 'ASC' },
    });
  }

  async getTierById(id: string): Promise<VipTier> {
    const tier = await this.tierRepository.findOne({ where: { id } });
    if (!tier) throw new NotFoundException(`VIP tier "${id}" not found`);
    return tier;
  }

  async assignBenefits(tierId: string, ticketId: string, requesterId: string): Promise<VipAssignment> {
    const tier = await this.getTierById(tierId);
    await this.assertOrganizer(tier.eventId, requesterId);

    const ticket = await this.ticketsService.getTicketById(ticketId);
    if (ticket.eventId !== tier.eventId) {
      throw new BadRequestException('Ticket does not belong to this event');
    }

    if (tier.filledSlots >= tier.maxSlots) {
      throw new BadRequestException('VIP tier is full');
    }

    tier.filledSlots += 1;
    await this.tierRepository.save(tier);

    const assignment = this.assignmentRepository.create({ tierId, ticketId });
    return this.assignmentRepository.save(assignment);
  }

  async validateAccess(ticketId: string, tierName: string): Promise<boolean> {
    const assignment = await this.assignmentRepository.findOne({
      where: { ticketId },
      relations: ['tier'],
    });
    if (!assignment) return false;
    return assignment.tier.name === tierName;
  }

  private async assertOrganizer(eventId: string, requesterId: string): Promise<void> {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== requesterId) {
      throw new ForbiddenException('Only the event organizer can manage VIP tiers');
    }
  }
}
