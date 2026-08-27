import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

@Injectable()
export class VenuesService {
  constructor(
    @InjectRepository(Venue)
    private readonly venueRepo: Repository<Venue>,
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
  }
}
