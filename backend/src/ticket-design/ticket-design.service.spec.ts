import { ForbiddenException } from '@nestjs/common';
import { BackgroundPattern, TicketDesign } from './entities/ticket-design.entity';
import { TicketDesignService } from './ticket-design.service';

describe('TicketDesignService', () => {
  let service: TicketDesignService;
  let designRepository: {
    create: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let eventsService: { getEventById: jest.Mock };

  beforeEach(() => {
    designRepository = {
      create: jest.fn((value) => value),
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(async (value) => ({ ...value, id: value.id ?? 'design-1' })),
      createQueryBuilder: jest.fn(),
    };
    eventsService = {
      getEventById: jest.fn().mockResolvedValue({ organizerId: 'organizer-1' }),
    };
    service = new TicketDesignService(
      designRepository as never,
      eventsService as never,
    );
  });

  it('saves designs only for the event organizer and keeps the selected theme active', async () => {
    const deactivateOthers = { execute: jest.fn().mockResolvedValue(undefined) };
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnValue(deactivateOthers),
    };
    designRepository.createQueryBuilder.mockReturnValue(updateBuilder);
    designRepository.save.mockImplementation(async (value) => ({
      ...value,
      id: 'design-1',
      isActive: true,
    }));

    const saved = await service.save_ticket_design(
      'event-1',
      {
        name: 'Neon night',
        isActive: true,
      },
      'organizer-1',
    );

    expect(saved.name).toBe('Neon night');
    expect(saved.isActive).toBe(true);
    expect(deactivateOthers.execute).toHaveBeenCalled();

    await expect(
      service.saveTicketDesign('event-1', { name: 'Not mine' }, 'attendee-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('renders safe custom-image CSS and compiles themes without reloading each design', async () => {
    const design = {
      id: 'design-1',
      eventId: 'event-1',
      name: 'Photo theme',
      backgroundPattern: BackgroundPattern.CUSTOM_IMAGE,
      backgroundImageUrl: 'https://cdn.example.com/ticket image.jpg',
      backgroundColor: '#112233',
      textColor: '#FFFFFF',
      accentColor: '#AABBCC',
      logoUrl: null,
      layout: [],
    } as TicketDesign;
    designRepository.findOne.mockResolvedValue(design);
    designRepository.find.mockResolvedValue([design]);

    const rendered = await service.render_ticket_layout('design-1');
    expect(rendered.background.css).toContain(
      'url("https://cdn.example.com/ticket%20image.jpg")',
    );
    expect(rendered.background.css).toContain('background-color: #112233');

    await expect(service.compile_design_themes('event-1')).resolves.toEqual([
      rendered,
    ]);
    expect(designRepository.findOne).toHaveBeenCalledTimes(1);
  });
});
