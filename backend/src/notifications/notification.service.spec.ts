import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { NotificationService } from './notification.service';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Event, EventStatus } from '../events/entities/event.entity';

describe('NotificationService', () => {
    let service: NotificationService;
    let queue: any;
    let ticketRepo: any;

    const mockQueue = {
        add: jest.fn(),
    };

    const mockTicketRepo = {
        find: jest.fn(),
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                NotificationService,
                {
                    provide: getQueueToken('notifications'),
                    useValue: mockQueue,
                },
                {
                    provide: getRepositoryToken(TicketEntity),
                    useValue: mockTicketRepo,
                },
            ],
        }).compile();

        service = module.get<NotificationService>(NotificationService);
        queue = module.get(getQueueToken('notifications'));
        ticketRepo = module.get(getRepositoryToken(TicketEntity));
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('queueLifecycleEmail', () => {
        const event = {
            id: 'event-1',
            title: 'Cool Event',
            organizerId: 'org-1',
            status: EventStatus.PUBLISHED,
        } as Event;

        it('should queue sendEventPublishedEmail for PUBLISHED status', async () => {
            await service.queueLifecycleEmail(event);
            expect(queue.add).toHaveBeenCalledWith('sendEventPublishedEmail', {
                organizerId: 'org-1',
                eventTitle: 'Cool Event',
                eventId: 'event-1',
            });
        });

        it('should queue sendEventCompletedEmail for COMPLETED status', async () => {
            const completedEvent = { ...event, status: EventStatus.COMPLETED } as Event;
            await service.queueLifecycleEmail(completedEvent);
            expect(queue.add).toHaveBeenCalledWith('sendEventCompletedEmail', {
                organizerId: 'org-1',
                eventTitle: 'Cool Event',
                eventId: 'event-1',
            });
        });

        it('should queue batch sendEventCancelledEmail for CANCELLED status', async () => {
            const cancelledEvent = { ...event, status: EventStatus.CANCELLED } as Event;
            mockTicketRepo.find.mockResolvedValue([
                { ownerId: 'user-1' },
                { ownerId: 'user-2' },
                { ownerId: 'user-1' }, // Duplicate owner should be unified
            ]);

            await service.queueLifecycleEmail(cancelledEvent);

            expect(ticketRepo.find).toHaveBeenCalledWith(expect.objectContaining({
                where: { eventId: 'event-1', status: 'valid' }
            }));
            expect(queue.add).toHaveBeenCalledTimes(2);
            expect(queue.add).toHaveBeenCalledWith('sendEventCancelledEmail', {
                userId: 'user-1',
                eventTitle: 'Cool Event',
                eventId: 'event-1',
            });
            expect(queue.add).toHaveBeenCalledWith('sendEventCancelledEmail', {
                userId: 'user-2',
                eventTitle: 'Cool Event',
                eventId: 'event-1',
            });
        });
    });
});
