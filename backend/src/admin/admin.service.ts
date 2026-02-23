import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Event, EventStatus } from '../events/entities/event.entity';

export enum UserStatus {
  ACTIVE = 'active',
  BLOCKED = 'blocked',
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // ── Events ────────────────────────────────────────────────────────────────

  async approveEvent(eventId: string): Promise<Event> {
    const event = await this.findEventOrFail(eventId);

    if (event.status !== EventStatus.DRAFT) {
      throw new BadRequestException(
        `Only draft events can be approved. Current status: "${event.status}".`,
      );
    }

    event.status = EventStatus.PUBLISHED;
    return this.eventRepository.save(event);
  }

  async suspendEvent(eventId: string): Promise<Event> {
    const event = await this.findEventOrFail(eventId);

    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('Event is already cancelled.');
    }

    if (event.status === EventStatus.COMPLETED) {
      throw new BadRequestException('Completed events cannot be suspended.');
    }

    event.status = EventStatus.CANCELLED;
    return this.eventRepository.save(event);
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async blockUser(userId: string): Promise<User> {
    const user = await this.findUserOrFail(userId);

    if ((user as any).status === UserStatus.BLOCKED) {
      throw new BadRequestException('User is already blocked.');
    }

    (user as any).status = UserStatus.BLOCKED;
    return this.userRepository.save(user);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async findEventOrFail(id: string): Promise<Event> {
    const event = await this.eventRepository.findOne({ where: { id } });
    if (!event) throw new NotFoundException(`Event "${id}" not found.`);
    return event;
  }

  private async findUserOrFail(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User "${id}" not found.`);
    return user;
  }
}
