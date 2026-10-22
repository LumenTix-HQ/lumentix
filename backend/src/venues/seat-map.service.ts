import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Event } from '../events/entities/event.entity';

export interface Seat {
  id: string;
  row: string;
  number: number;
  section: string;
  price: number;
  tier: 'standard' | 'premium' | 'vip';
  status: 'available' | 'reserved' | 'sold';
  obstructedView: boolean;
  accessible: boolean;
  x: number;
  y: number;
}

export interface SeatReservation {
  id: string;
  seatId: string;
  userId: string;
  eventId: string;
  expiresAt: Date;
  createdAt: Date;
}

interface SeatMap {
  eventId: string;
  venueId: string;
  sections: Array<{
    id: string;
    name: string;
    seats: Seat[];
  }>;
  metadata: {
    totalSeats: number;
    availableSeats: number;
    reservedSeats: number;
    soldSeats: number;
  };
}

@Injectable()
export class SeatMapService {
  private reservations = new Map<string, SeatReservation>();
  private seatMaps = new Map<string, SeatMap>();

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
  ) {
    this.cleanupExpiredReservations();
  }

  async renderSeatMap(eventId: string): Promise<{
    eventId: string;
    svg: string;
    seats: Seat[];
    metadata: any;
  }> {
    const event = await this.eventRepository.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const seatMap = this.getSeatMapForEvent(eventId);
    const allSeats = seatMap.sections.flatMap(s => s.seats);

    const svg = this.generateSvgSeatMap(seatMap);

    return {
      eventId,
      svg,
      seats: allSeats,
      metadata: seatMap.metadata,
    };
  }

  async reserveSeatTemporarily(
    eventId: string,
    seatId: string,
    userId: string,
    durationMinutes: number = 10,
  ): Promise<{ reserved: boolean; reservation?: SeatReservation; expiresAt?: Date }> {
    const seatMap = this.getSeatMapForEvent(eventId);
    const seat = seatMap.sections.flatMap(s => s.seats).find(s => s.id === seatId);

    if (!seat) {
      throw new NotFoundException('Seat not found');
    }

    if (seat.status === 'sold') {
      return { reserved: false };
    }

    const existingReservation = Array.from(this.reservations.values()).find(
      r => r.seatId === seatId && r.eventId === eventId && r.expiresAt > new Date(),
    );

    if (existingReservation && existingReservation.userId !== userId) {
      return { reserved: false };
    }

    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    const reservation: SeatReservation = {
      id: `${eventId}-${seatId}-${userId}`,
      seatId,
      userId,
      eventId,
      expiresAt,
      createdAt: new Date(),
    };

    this.reservations.set(reservation.id, reservation);
    seat.status = 'reserved';

    return { reserved: true, reservation, expiresAt };
  }

  async releaseExpiredReservation(reservationId: string): Promise<{ released: boolean }> {
    const reservation = this.reservations.get(reservationId);
    
    if (!reservation) {
      return { released: false };
    }

    const seatMap = this.getSeatMapForEvent(reservation.eventId);
    const seat = seatMap.sections.flatMap(s => s.seats).find(s => s.id === reservation.seatId);

    if (seat && seat.status === 'reserved') {
      seat.status = 'available';
    }

    this.reservations.delete(reservationId);
    return { released: true };
  }

  async getUserReservations(eventId: string, userId: string): Promise<SeatReservation[]> {
    return Array.from(this.reservations.values()).filter(
      r => r.eventId === eventId && r.userId === userId && r.expiresAt > new Date(),
    );
  }

  async releaseUserReservations(eventId: string, userId: string): Promise<{ releasedCount: number }> {
    const userReservations = await this.getUserReservations(eventId, userId);
    
    for (const reservation of userReservations) {
      await this.releaseExpiredReservation(reservation.id);
    }

    return { releasedCount: userReservations.length };
  }

  private getSeatMapForEvent(eventId: string): SeatMap {
    if (!this.seatMaps.has(eventId)) {
      this.seatMaps.set(eventId, this.generateDefaultSeatMap(eventId));
    }
    return this.seatMaps.get(eventId)!;
  }

  private generateDefaultSeatMap(eventId: string): SeatMap {
    const sections = [
      {
        id: 'orchestra',
        name: 'Orchestra',
        seats: this.generateSeatsForSection('orchestra', 10, 20, 100, 'premium'),
      },
      {
        id: 'mezzanine',
        name: 'Mezzanine',
        seats: this.generateSeatsForSection('mezzanine', 8, 15, 80, 'standard'),
      },
      {
        id: 'balcony',
        name: 'Balcony',
        seats: this.generateSeatsForSection('balcony', 6, 12, 60, 'standard', true),
      },
    ];

    const allSeats = sections.flatMap(s => s.seats);
    
    return {
      eventId,
      venueId: 'default-venue',
      sections,
      metadata: {
        totalSeats: allSeats.length,
        availableSeats: allSeats.filter(s => s.status === 'available').length,
        reservedSeats: allSeats.filter(s => s.status === 'reserved').length,
        soldSeats: allSeats.filter(s => s.status === 'sold').length,
      },
    };
  }

  private generateSeatsForSection(
    section: string,
    rows: number,
    seatsPerRow: number,
    basePrice: number,
    tier: 'standard' | 'premium' | 'vip',
    hasObstructedViews: boolean = false,
  ): Seat[] {
    const seats: Seat[] = [];
    const rowLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    for (let r = 0; r < rows; r++) {
      for (let s = 1; s <= seatsPerRow; s++) {
        const isEdgeSeat = s === 1 || s === seatsPerRow;
        const isBackRow = r >= rows - 2;
        const obstructedView = hasObstructedViews && isBackRow && Math.random() > 0.7;

        seats.push({
          id: `${section}-${rowLabels[r]}${s}`,
          row: rowLabels[r],
          number: s,
          section,
          price: basePrice + (tier === 'premium' ? 20 : tier === 'vip' ? 50 : 0),
          tier,
          status: 'available',
          obstructedView,
          accessible: isEdgeSeat && r < 3,
          x: s * 40,
          y: r * 40,
        });
      }
    }

    return seats;
  }

  private generateSvgSeatMap(seatMap: SeatMap): string {
    const width = 1200;
    const height = 800;
    
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += '<rect width="100%" height="100%" fill="#f5f5f5"/>';
    svg += '<text x="600" y="30" font-size="24" text-anchor="middle" font-weight="bold">Seat Map</text>';

    let yOffset = 80;
    
    for (const section of seatMap.sections) {
      svg += `<text x="20" y="${yOffset}" font-size="18" font-weight="bold">${section.name}</text>`;
      yOffset += 30;

      for (const seat of section.seats) {
        const color = seat.status === 'sold' ? '#ccc' : 
                     seat.status === 'reserved' ? '#ffa500' : 
                     seat.tier === 'premium' ? '#4a90e2' :
                     seat.tier === 'vip' ? '#gold' : '#4caf50';

        svg += `<circle cx="${seat.x + 50}" cy="${yOffset + seat.y}" r="8" fill="${color}" `;
        svg += `stroke="${seat.obstructedView ? 'red' : 'black'}" stroke-width="${seat.obstructedView ? 2 : 1}"/>`;
        
        if (seat.accessible) {
          svg += `<text x="${seat.x + 50}" y="${yOffset + seat.y + 20}" font-size="10" text-anchor="middle">♿</text>`;
        }
      }

      yOffset += 200;
    }

    svg += '<g transform="translate(20, 700)">';
    svg += '<text font-size="14" font-weight="bold">Legend:</text>';
    svg += '<circle cx="10" cy="20" r="6" fill="#4caf50"/><text x="20" y="25" font-size="12">Available</text>';
    svg += '<circle cx="10" cy="40" r="6" fill="#ffa500"/><text x="20" y="45" font-size="12">Reserved</text>';
    svg += '<circle cx="10" cy="60" r="6" fill="#ccc"/><text x="20" y="65" font-size="12">Sold</text>';
    svg += '<circle cx="150" cy="20" r="6" fill="#4a90e2"/><text x="160" y="25" font-size="12">Premium</text>';
    svg += '<circle cx="150" cy="40" r="6" stroke="red" stroke-width="2" fill="white"/><text x="160" y="45" font-size="12">Obstructed View</text>';
    svg += '</g>';

    svg += '</svg>';
    
    return svg;
  }

  private cleanupExpiredReservations() {
    setInterval(() => {
      const now = new Date();
      for (const [id, reservation] of this.reservations.entries()) {
        if (reservation.expiresAt < now) {
          this.releaseExpiredReservation(id);
        }
      }
    }, 60000); // Run every minute
  }
}
