import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BackgroundPattern,
  TicketDesign,
} from './entities/ticket-design.entity';
import { SaveTicketDesignDto } from './dto/save-ticket-design.dto';
import { EventsService } from '../events/events.service';

export interface RenderedTicketLayout {
  designId: string;
  eventId: string;
  name: string;
  background: {
    pattern: BackgroundPattern;
    color: string;
    imageUrl: string | null;
    css: string;
  };
  colors: {
    text: string;
    accent: string;
  };
  logoUrl: string | null;
  layout: TicketDesign['layout'];
}

const PATTERN_CSS: Record<BackgroundPattern, (color: string, accent: string) => string> = {
  [BackgroundPattern.SOLID]: (color) => `background-color: ${color};`,
  [BackgroundPattern.DOTS]: (color, accent) =>
    `background-color: ${color}; background-image: radial-gradient(${accent} 1px, transparent 1px); background-size: 12px 12px;`,
  [BackgroundPattern.WAVES]: (color, accent) =>
    `background-color: ${color}; background-image: repeating-linear-gradient(45deg, ${accent} 0, ${accent} 2px, transparent 2px, transparent 12px);`,
  [BackgroundPattern.GRADIENT]: (color, accent) =>
    `background: linear-gradient(135deg, ${color}, ${accent});`,
  [BackgroundPattern.CUSTOM_IMAGE]: (color) => `background-color: ${color};`,
};

@Injectable()
export class TicketDesignService {
  constructor(
    @InjectRepository(TicketDesign)
    private readonly designRepository: Repository<TicketDesign>,
    private readonly eventsService: EventsService,
  ) {}

  async saveTicketDesign(
    eventId: string,
    dto: SaveTicketDesignDto,
    requesterId: string,
    designId?: string,
  ): Promise<TicketDesign> {
    await this.assertOrganizer(eventId, requesterId);

    const design = designId
      ? await this.getDesignById(designId)
      : this.designRepository.create({ eventId });

    if (designId && design.eventId !== eventId) {
      throw new ForbiddenException('Design does not belong to this event');
    }

    Object.assign(design, {
      name: dto.name,
      backgroundPattern: dto.backgroundPattern ?? design.backgroundPattern ?? BackgroundPattern.SOLID,
      backgroundImageUrl: dto.backgroundImageUrl ?? design.backgroundImageUrl ?? null,
      backgroundColor: dto.backgroundColor ?? design.backgroundColor ?? '#FFFFFF',
      textColor: dto.textColor ?? design.textColor ?? '#000000',
      accentColor: dto.accentColor ?? design.accentColor ?? '#6366F1',
      logoUrl: dto.logoUrl ?? design.logoUrl ?? null,
      layout: dto.layout ?? design.layout ?? [],
      isActive: dto.isActive ?? design.isActive ?? false,
    });

    const saved = await this.designRepository.save(design);

    if (saved.isActive) {
      await this.designRepository
        .createQueryBuilder()
        .update(TicketDesign)
        .set({ isActive: false })
        .where('eventId = :eventId AND id != :id', { eventId, id: saved.id })
        .execute();
    }

    return saved;
  }

  async renderTicketLayout(designId: string): Promise<RenderedTicketLayout> {
    const design = await this.getDesignById(designId);

    const cssBuilder = PATTERN_CSS[design.backgroundPattern];
    const css =
      design.backgroundPattern === BackgroundPattern.CUSTOM_IMAGE && design.backgroundImageUrl
        ? `background-image: url(${design.backgroundImageUrl}); background-size: cover;`
        : cssBuilder(design.backgroundColor, design.accentColor);

    return {
      designId: design.id,
      eventId: design.eventId,
      name: design.name,
      background: {
        pattern: design.backgroundPattern,
        color: design.backgroundColor,
        imageUrl: design.backgroundImageUrl,
        css,
      },
      colors: {
        text: design.textColor,
        accent: design.accentColor,
      },
      logoUrl: design.logoUrl,
      layout: design.layout,
    };
  }

  async compileDesignThemes(eventId: string): Promise<RenderedTicketLayout[]> {
    const designs = await this.designRepository.find({
      where: { eventId },
      order: { createdAt: 'ASC' },
    });

    return Promise.all(designs.map((design) => this.renderTicketLayout(design.id)));
  }

  async listDesigns(eventId: string): Promise<TicketDesign[]> {
    return this.designRepository.find({ where: { eventId } });
  }

  async getDesignById(id: string): Promise<TicketDesign> {
    const design = await this.designRepository.findOne({ where: { id } });
    if (!design) throw new NotFoundException(`Ticket design "${id}" not found`);
    return design;
  }

  private async assertOrganizer(eventId: string, requesterId: string): Promise<void> {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== requesterId) {
      throw new ForbiddenException('Only the event organizer can manage ticket designs');
    }
  }
}
