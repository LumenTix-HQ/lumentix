import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessibilityInventory } from './entities/accessibility-inventory.entity';
import { AccessibilityBooking } from './entities/accessibility-booking.entity';
import { SetupAccessibilityInventoryDto } from './dto/setup-accessibility-inventory.dto';
import { RequestAccessibilityBookingDto } from './dto/request-accessibility-booking.dto';
import { EventsService } from '../events/events.service';
import { TicketsService } from '../tickets/tickets.service';

@Injectable()
export class AccessibilityService {
  constructor(
    @InjectRepository(AccessibilityInventory)
    private readonly inventoryRepository: Repository<AccessibilityInventory>,
    @InjectRepository(AccessibilityBooking)
    private readonly bookingRepository: Repository<AccessibilityBooking>,
    private readonly eventsService: EventsService,
    private readonly ticketsService: TicketsService,
  ) {}

  async setupInventory(
    eventId: string,
    dto: SetupAccessibilityInventoryDto,
    requesterId: string,
  ): Promise<AccessibilityInventory> {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== requesterId) {
      throw new ForbiddenException('Only the event organizer can manage accessibility inventory');
    }

    const existing = await this.inventoryRepository.findOne({
      where: { eventId, type: dto.type },
    });
    if (existing) {
      existing.totalSlots = dto.totalSlots;
      existing.description = dto.description ?? existing.description;
      return this.inventoryRepository.save(existing);
    }

    const inventory = this.inventoryRepository.create({
      ...dto,
      eventId,
    });
    return this.inventoryRepository.save(inventory);
  }

  async getInventory(eventId: string): Promise<AccessibilityInventory[]> {
    return this.inventoryRepository.find({ where: { eventId } });
  }

  async requestBooking(
    eventId: string,
    dto: RequestAccessibilityBookingDto,
    requesterId: string,
  ): Promise<AccessibilityBooking> {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== requesterId) {
      throw new ForbiddenException('Only the event organizer can book accessibility accommodations');
    }

    const inventory = await this.inventoryRepository.findOne({ where: { id: dto.inventoryId } });
    if (!inventory) throw new NotFoundException('Accessibility inventory not found');

    const ticket = await this.ticketsService.getTicketById(dto.ticketId);
    if (ticket.eventId !== eventId) {
      throw new BadRequestException('Ticket does not belong to this event');
    }

    if (inventory.bookedSlots >= inventory.totalSlots) {
      throw new BadRequestException('No available slots for this accommodation type');
    }

    inventory.bookedSlots += 1;
    await this.inventoryRepository.save(inventory);

    const booking = this.bookingRepository.create({
      inventoryId: dto.inventoryId,
      ticketId: dto.ticketId,
      type: inventory.type,
      notes: dto.notes,
    });
    return this.bookingRepository.save(booking);
  }

  async getBookings(eventId: string): Promise<AccessibilityBooking[]> {
    return this.bookingRepository.find({
      where: { inventory: { eventId } },
      relations: ['inventory'],
    });
  }

  async getBookingById(id: string): Promise<AccessibilityBooking> {
    const booking = await this.bookingRepository.findOne({ where: { id }, relations: ['inventory'] });
    if (!booking) throw new NotFoundException(`Accessibility booking "${id}" not found`);
    return booking;
  }
}
