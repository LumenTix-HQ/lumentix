import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { TicketsService } from '../tickets/tickets.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Event, EventStatus } from './entities/event.entity';
import { Role } from '../common/decorators/roles.decorator';
import { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';

const mockEvent: Event = {
  id: 'uuid-1',
  title: 'Test Event',
  description: 'desc',
  location: 'Lagos',
  startDate: new Date('2025-06-01'),
  endDate: new Date('2025-06-02'),
  ticketPrice: 10,
  currency: 'USD',
  organizerId: 'organizer-1',
  status: EventStatus.DRAFT,
  maxAttendees: 100,
  escrowPublicKey: null,
  escrowSecretEncrypted: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockEventsService = {
  createEvent: jest.fn(),
  updateEvent: jest.fn(),
  deleteEvent: jest.fn(),
  getEventById: jest.fn(),
  listEvents: jest.fn(),
};

const mockTicketsService = {
  findByEvent: jest.fn(),
  getEventTicketSummary: jest.fn(),
};

function createMockExecutionContext(
  userRole: string,
  userId: string,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () =>
        ({
          user: { id: userId, role: userRole as Role },
        }) as Partial<AuthenticatedRequest>,
      getResponse: jest.fn(),
      getNext: jest.fn(),
    }),
    getHandler: () => EventsController.prototype.create,
    getClass: () => EventsController,
    getArgs: jest.fn(),
    getArgByIndex: jest.fn(),
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
    getType: jest.fn(),
  } as unknown as ExecutionContext;
}

describe('EventsController', () => {
  let controller: EventsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        { provide: EventsService, useValue: mockEventsService },
        { provide: TicketsService, useValue: mockTicketsService },
        RolesGuard,
        Reflector,
      ],
    }).compile();

    controller = module.get<EventsController>(EventsController);
    jest.clearAllMocks();
  });

  it('organizer can create event', async () => {
    mockEventsService.createEvent.mockResolvedValue(mockEvent);

    const req = {
      user: { id: 'organizer-1', role: Role.ORGANIZER },
    } as AuthenticatedRequest;

    const result = await controller.create(
      { title: 'Test Event', startDate: '2025-06-01', endDate: '2025-06-02' },
      req,
    );

    expect(mockEventsService.createEvent).toHaveBeenCalledWith(
      expect.any(Object),
      'organizer-1',
    );
    expect(result).toEqual(mockEvent);
  });

  it('should get event by id', async () => {
    mockEventsService.getEventById.mockResolvedValue(mockEvent);
    const result = await controller.getById('uuid-1');
    expect(result).toEqual(mockEvent);
  });

  it('should list events with pagination', async () => {
    const paginated = {
      data: [mockEvent],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    };
    mockEventsService.listEvents.mockResolvedValue(paginated);

    const result = await controller.list({ page: 1, limit: 10 });
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('should update event', async () => {
    const updated = { ...mockEvent, title: 'Updated' };
    mockEventsService.updateEvent.mockResolvedValue(updated);

    const mockReq = { user: { id: 'caller-uuid' } } as any;
    const result = await controller.update('uuid-1', { title: 'Updated' }, mockReq);
    expect(result.title).toBe('Updated');
  });
});

describe('RolesGuard', () => {
  it('should deny non-organizer role', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);

    const mockContext = createMockExecutionContext('attendee', 'user-1');

    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.ORGANIZER]);

    expect(guard.canActivate(mockContext)).toBe(false);
  });

  it('should allow organizer role', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);

    const mockContext = createMockExecutionContext(Role.ORGANIZER, 'org-1');

    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.ORGANIZER]);

    expect(guard.canActivate(mockContext)).toBe(true);
  });
});
