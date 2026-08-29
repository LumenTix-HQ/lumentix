import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Venue, VenueStatus } from './entities/venue.entity';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { ListVenuesDto } from './dto/list-venues.dto';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
import { VenueSection } from './entities/venue-section.entity';
import { Seat, SeatStatus } from './entities/seat.entity';
import { CreateVenueLayoutDto } from './dto/create-venue-layout.dto';
import { EventsService } from '../events/events.service';

@Injectable()
export class VenuesService {
  constructor(
    @InjectRepository(Venue)
    private readonly venueRepo: Repository<Venue>,
    @InjectRepository(VenueSection)
    private readonly sectionRepository: Repository<VenueSection>,
    @InjectRepository(Seat)
    private readonly seatRepository: Repository<Seat>,
    private readonly eventsService: EventsService,
  ) {}

  async createVenue(dto: CreateVenueDto, ownerId: string): Promise<Venue> {
    const venue = this.venueRepo.create({ ...dto, ownerId });
    return this.venueRepo.save(venue);
  }

  async listVenues(dto: ListVenuesDto): Promise<PaginatedResult<Venue>> {
    const { city, country, search, minCapacity, page = 1, limit = 20 } = dto;

    const qb = this.venueRepo
      .createQueryBuilder('venue')
      .where('venue.status = :status', { status: VenueStatus.ACTIVE });

    if (city) {
      qb.andWhere('LOWER(venue.city) = LOWER(:city)', { city });
    }
    if (country) {
      qb.andWhere('LOWER(venue.country) = LOWER(:country)', { country });
    }
    if (search) {
      qb.andWhere(
        '(LOWER(venue.name) LIKE LOWER(:search) OR LOWER(venue.address) LIKE LOWER(:search))',
        { search: `%${search}%` },
      );
    }
    if (minCapacity !== undefined) {
      qb.andWhere('venue.capacity >= :minCapacity', { minCapacity });
    }

    qb.orderBy('venue.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getVenue(id: string): Promise<Venue> {
    const venue = await this.venueRepo.findOne({ where: { id } });
    if (!venue) throw new NotFoundException(`Venue "${id}" not found.`);
    return venue;
  }

  async updateVenue(
    id: string,
    dto: UpdateVenueDto,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<Venue> {
    const venue = await this.getVenue(id);
    if (!isAdmin && venue.ownerId !== requesterId) {
      throw new ForbiddenException('You do not own this venue.');
    }
    Object.assign(venue, dto);
    return this.venueRepo.save(venue);
  }

  async deleteVenue(id: string, requesterId: string, isAdmin: boolean): Promise<void> {
    const venue = await this.getVenue(id);
    if (!isAdmin && venue.ownerId !== requesterId) {
      throw new ForbiddenException('You do not own this venue.');
    }
    await this.venueRepo.remove(venue);

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
    await this.release_expired_reservation();
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
    return this.reserve_seat_temporarily(seatId, requesterId);
  }

  async reserve_seat_temporarily(
    seatId: string,
    requesterId: string,
    holdDurationSeconds = 300,
  ): Promise<Seat> {
    const holdDuration = Math.min(Math.max(30, Number(holdDurationSeconds) || 300), 900);
    const seat = await this.getSeatById(seatId);

    if (seat.status === SeatStatus.HELD && seat.holdExpiresAt && seat.holdExpiresAt <= new Date()) {
      seat.status = SeatStatus.AVAILABLE;
      seat.heldBy = null;
      seat.holdExpiresAt = null;
    }

    if (seat.status !== SeatStatus.AVAILABLE) {
      throw new BadRequestException(`Seat "${seat.seatIdentifier}" is not available (status: ${seat.status})`);
    }

    seat.status = SeatStatus.HELD;
    seat.heldBy = requesterId;
    seat.holdExpiresAt = new Date(Date.now() + holdDuration * 1000);
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
    seat.holdExpiresAt = null;
    return this.seatRepository.save(seat);
  }

  async release_expired_reservation(seatId?: string): Promise<number> {
    const seats = await this.seatRepository.find({ where: seatId ? { id: seatId } : { status: SeatStatus.HELD } });
    const expired = seats.filter((seat) => seat.status === SeatStatus.HELD && seat.holdExpiresAt && seat.holdExpiresAt <= new Date());
    if (!expired.length) return 0;
    for (const seat of expired) {
      seat.status = SeatStatus.AVAILABLE;
      seat.heldBy = null;
      seat.holdExpiresAt = null;
    }
    await this.seatRepository.save(expired);
    return expired.length;
  }

  async getAvailableSeats(eventId: string): Promise<Seat[]> {
    await this.release_expired_reservation();
    const sections = await this.sectionRepository.find({ where: { eventId } });
    const sectionIds = sections.map(s => s.id);
    if (sectionIds.length === 0) return [];
    return this.seatRepository.find({
      where: { sectionId: In(sectionIds), status: SeatStatus.AVAILABLE },
      order: { row: 'ASC', number: 'ASC' },
    });
  }
}
