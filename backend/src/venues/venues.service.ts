import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { VenueSection } from './entities/venue-section.entity';
import { Seat, SeatStatus } from './entities/seat.entity';
import { CreateVenueLayoutDto } from './dto/create-venue-layout.dto';
import { EventsService } from '../events/events.service';

@Injectable()
export class VenuesService {
  constructor(
    @InjectRepository(VenueSection)
    private readonly sectionRepository: Repository<VenueSection>,
    @InjectRepository(Seat)
    private readonly seatRepository: Repository<Seat>,
    private readonly eventsService: EventsService,
  ) {}

  async createLayout(eventId: string, dto: CreateVenueLayoutDto, requesterId: string): Promise<VenueSection> {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== requesterId) {
      throw new ForbiddenException('Only the event organizer can create venue layouts');
    }

    const section = this.sectionRepository.create({
      ...dto,
      eventId,
    });
    const saved = await this.sectionRepository.save(section);

    const seats: Seat[] = [];
    for (let row = 1; row <= dto.rows; row++) {
      for (let num = 1; num <= dto.seatsPerRow; num++) {
        seats.push(
          this.seatRepository.create({
            sectionId: saved.id,
            seatIdentifier: `${String.fromCharCode(64 + row)}${num}`,
            row,
            number: num,
          }),
        );
      }
    }
    await this.seatRepository.save(seats);

    return saved;
  }

  async getLayout(eventId: string): Promise<VenueSection[]> {
    return this.sectionRepository.find({
      where: { eventId },
      order: { createdAt: 'ASC' },
    });
  }

  async getSectionById(id: string): Promise<VenueSection> {
    const section = await this.sectionRepository.findOne({ where: { id } });
    if (!section) throw new NotFoundException(`Section "${id}" not found`);
    return section;
  }

  async getSeats(sectionId: string): Promise<Seat[]> {
    const section = await this.getSectionById(sectionId);
    return this.seatRepository.find({
      where: { sectionId: section.id },
      order: { row: 'ASC', number: 'ASC' },
    });
  }

  async getSeatById(id: string): Promise<Seat> {
    const seat = await this.seatRepository.findOne({ where: { id }, relations: ['section'] });
    if (!seat) throw new NotFoundException(`Seat "${id}" not found`);
    return seat;
  }

  async selectSeat(seatId: string, ticketId: string, requesterId: string): Promise<Seat> {
    const seat = await this.getSeatById(seatId);

    if (seat.status !== SeatStatus.AVAILABLE) {
      throw new BadRequestException(`Seat "${seat.seatIdentifier}" is not available (status: ${seat.status})`);
    }

    const section = await this.getSectionById(seat.sectionId);
    const event = await this.eventsService.getEventById(section.eventId);

    seat.status = SeatStatus.HELD;
    seat.heldBy = requesterId;
    return this.seatRepository.save(seat);
  }

  async releaseSeat(seatId: string, requesterId: string): Promise<Seat> {
    const seat = await this.getSeatById(seatId);

    if (seat.status !== SeatStatus.HELD) {
      throw new BadRequestException(`Seat "${seat.seatIdentifier}" is not currently held`);
    }

    const section = await this.getSectionById(seat.sectionId);
    const event = await this.eventsService.getEventById(section.eventId);

    if (seat.heldBy !== requesterId && event.organizerId !== requesterId) {
      throw new ForbiddenException('Only the holder or organizer can release a seat');
    }

    seat.status = SeatStatus.AVAILABLE;
    seat.heldBy = null;
    return this.seatRepository.save(seat);
  }

  async getAvailableSeats(eventId: string): Promise<Seat[]> {
    const sections = await this.sectionRepository.find({ where: { eventId } });
    const sectionIds = sections.map(s => s.id);
    if (sectionIds.length === 0) return [];
    return this.seatRepository.find({
      where: { sectionId: In(sectionIds), status: SeatStatus.AVAILABLE },
      order: { row: 'ASC', number: 'ASC' },
    });
  }
}
