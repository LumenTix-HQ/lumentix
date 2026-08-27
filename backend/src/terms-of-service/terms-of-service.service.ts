import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventTermsOfService } from './entities/event-tos.entity';
import { SaveEventTosDto } from './dto/save-event-tos.dto';
import { EventsService } from '../events/events.service';

@Injectable()
export class TermsOfServiceService {
  constructor(
    @InjectRepository(EventTermsOfService)
    private readonly tosRepository: Repository<EventTermsOfService>,
    private readonly eventsService: EventsService,
  ) {}

  async saveEventTos(
    eventId: string,
    dto: SaveEventTosDto,
    organizerId: string,
  ): Promise<EventTermsOfService> {
    const event = await this.eventsService.getEventById(eventId);

    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('Only the event organizer can save ToS');
    }

    let tos = await this.tosRepository.findOne({
      where: { eventId, isActive: true },
    });

    if (tos) {
      // Archive the old version
      tos.isActive = false;
      await this.tosRepository.save(tos);

      // Create new version
      const newTos = this.tosRepository.create({
        eventId,
        termsContent: dto.termsContent,
        liabilityDisclaimers: dto.liabilityDisclaimers ?? null,
        customAgreements: dto.customAgreements ?? null,
        version: tos.version + 1,
      });
      return this.tosRepository.save(newTos);
    }

    const newTos = this.tosRepository.create({
      eventId,
      termsContent: dto.termsContent,
      liabilityDisclaimers: dto.liabilityDisclaimers ?? null,
      customAgreements: dto.customAgreements ?? null,
    });

    return this.tosRepository.save(newTos);
  }

  async validateTosAgreement(
    eventId: string,
    agreementVersion: number,
  ): Promise<boolean> {
    const tos = await this.tosRepository.findOne({
      where: { eventId, version: agreementVersion },
    });

    if (!tos) {
      throw new NotFoundException(
        `Terms of Service version ${agreementVersion} not found for event`,
      );
    }

    return tos.isActive;
  }

  async fetchTosForCheckout(eventId: string): Promise<EventTermsOfService> {
    const tos = await this.tosRepository.findOne({
      where: { eventId, isActive: true },
    });

    if (!tos) {
      throw new NotFoundException(
        `No active Terms of Service found for this event`,
      );
    }

    return tos;
  }

  async getEventTosHistory(eventId: string): Promise<EventTermsOfService[]> {
    return this.tosRepository.find({
      where: { eventId },
      order: { version: 'DESC' },
    });
  }
}
