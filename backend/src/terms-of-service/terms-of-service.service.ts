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
import type { EventsService } from '../events/events.service';

export interface TosTemplate {
  id: string;
  name: string;
  category: 'general' | 'liability' | 'media' | 'refund';
  description: string;
  defaultTerms: string;
  defaultDisclaimers: string;
  defaultAgreements: string;
}

@Injectable()
export class TermsOfServiceService {
  private readonly defaultTemplates: TosTemplate[] = [
    {
      id: 'standard-event',
      name: 'Standard Event Terms & Code of Conduct',
      category: 'general',
      description: 'Standard event rules, general admission guidelines, and attendee code of conduct.',
      defaultTerms:
        'By purchasing a ticket and entering the event premises, attendees agree to comply with venue safety guidelines, local laws, and event staff directives. Disruptive behavior, harassment, or unauthorized solicitation will result in ejection without refund.',
      defaultDisclaimers:
        'The organizer and venue are not responsible for lost, stolen, or damaged personal property. Attendees participate at their own risk.',
      defaultAgreements:
        'I agree to abide by all stated house rules, security screening procedures, and health guidelines established for this event.',
    },
    {
      id: 'sports-activity',
      name: 'Sports & Physical Activity Liability Waiver',
      category: 'liability',
      description: 'Comprehensive assumption of risk and physical liability waiver for sports, fitness, or active events.',
      defaultTerms:
        'Participation in this event involves physical activity, including strenuous exercise and competitive movements. All participants must be physically fit and free of medical conditions that could endanger themselves or others.',
      defaultDisclaimers:
        'I expressly acknowledge that participation entails inherent risks of injury or property damage. I voluntarily assume all risks, known and unknown, arising out of my participation in this event.',
      defaultAgreements:
        'I hereby release, waive, and forever discharge event organizers, sponsors, and venue operators from any and all liability, claims, or demands for personal injury, illness, or property damage.',
    },
    {
      id: 'media-consent',
      name: 'Media & Photography Release Waiver',
      category: 'media',
      description: 'Consent for event photography, live-streaming, audio recording, and social media broadcasting.',
      defaultTerms:
        'This event may be photographed, filmed, and recorded for promotional, editorial, or broadcast purposes across digital and physical media channels.',
      defaultDisclaimers:
        'Event organizers do not guarantee that attendees will not appear in published footage or marketing collateral.',
      defaultAgreements:
        'By attending, I grant the organizer irrevocable, worldwide, royalty-free permission to capture and use my image, voice, and likeness in connection with promotional and archival media.',
    },
    {
      id: 'refund-cancellation',
      name: 'Strict/Rescheduling Cancellation Disclaimer',
      category: 'refund',
      description: 'Clear stipulations on ticket transferability, weather delays, force majeure, and refund boundaries.',
      defaultTerms:
        'All ticket sales are final. Tickets may be transferred or resold via authorized platform mechanisms in accordance with published resale policies.',
      defaultDisclaimers:
        'In the event of cancellation or postponement due to weather, regulatory orders, or force majeure events, tickets will be honored for the rescheduled date. Cash refunds will be processed only in accordance with organizer refund policy limits.',
      defaultAgreements:
        'I understand and accept the refund and rescheduling terms applicable to this ticket purchase.',
    },
  ];

  constructor(
    @InjectRepository(EventTermsOfService)
    private readonly tosRepository: Repository<EventTermsOfService>,
    private readonly eventsService: EventsService,
  ) {}

  getTosTemplates(): TosTemplate[] {
    return [...this.defaultTemplates];
  }

  get_tos_templates(): TosTemplate[] {
    return this.getTosTemplates();
  }

  getTemplateById(templateId: string): TosTemplate {
    const template = this.defaultTemplates.find((t) => t.id === templateId);
    if (!template) {
      throw new NotFoundException(`Terms of Service template with ID "${templateId}" not found`);
    }
    return template;
  }

  async applyTemplate(
    eventId: string,
    templateId: string,
    organizerId: string,
    customOverrides?: Partial<SaveEventTosDto>,
  ): Promise<EventTermsOfService> {
    const template = this.getTemplateById(templateId);
    const dto: SaveEventTosDto = {
      termsContent: customOverrides?.termsContent || template.defaultTerms,
      liabilityDisclaimers: customOverrides?.liabilityDisclaimers ?? template.defaultDisclaimers,
      customAgreements: customOverrides?.customAgreements ?? template.defaultAgreements,
    };
    return this.saveEventTos(eventId, dto, organizerId);
  }

  async saveEventTos(
    eventId: string,
    dto: SaveEventTosDto,
    organizerId: string,
  ): Promise<EventTermsOfService> {
    const event = await this.eventsService.getEventById(eventId);

    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('Only the event organizer can save ToS');
    }

    const activeTos = await this.tosRepository.findOne({
      where: { eventId, isActive: true },
    });

    if (activeTos) {
      // Archive the old version
      activeTos.isActive = false;
      await this.tosRepository.save(activeTos);

      // Create new incremented version
      const newTos = this.tosRepository.create({
        eventId,
        termsContent: dto.termsContent,
        liabilityDisclaimers: dto.liabilityDisclaimers ?? null,
        customAgreements: dto.customAgreements ?? null,
        version: activeTos.version + 1,
        isActive: true,
      });
      return this.tosRepository.save(newTos);
    }

    const newTos = this.tosRepository.create({
      eventId,
      termsContent: dto.termsContent,
      liabilityDisclaimers: dto.liabilityDisclaimers ?? null,
      customAgreements: dto.customAgreements ?? null,
      version: 1,
      isActive: true,
    });

    return this.tosRepository.save(newTos);
  }

  // Alias for snake_case function requirement in issue #1191
  async save_event_tos(
    eventId: string,
    dto: SaveEventTosDto,
    organizerId: string,
  ): Promise<EventTermsOfService> {
    return this.saveEventTos(eventId, dto, organizerId);
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

  // Alias for snake_case function requirement in issue #1191
  async validate_tos_agreement(
    eventId: string,
    agreementVersion: number,
  ): Promise<boolean> {
    return this.validateTosAgreement(eventId, agreementVersion);
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

  // Alias for snake_case function requirement in issue #1191
  async fetch_tos_for_checkout(eventId: string): Promise<EventTermsOfService> {
    return this.fetchTosForCheckout(eventId);
  }

  async getEventTosHistory(eventId: string): Promise<EventTermsOfService[]> {
    return this.tosRepository.find({
      where: { eventId },
      order: { version: 'DESC' },
    });
  }
}
