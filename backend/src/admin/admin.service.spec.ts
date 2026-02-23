import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { Event, EventStatus } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';

const makeEvent = (status: EventStatus): Event =>
  ({
    id: 'event-uuid',
    title: 'Test Event',
    status,
  }) as Event;

const makeUser = (): User =>
  ({
    id: 'user-uuid',
    email: 'user@example.com',
    role: UserRole.EVENT_GOER,
    status: 'active',
  }) as unknown as User;

describe('AdminService', () => {
  let service: AdminService;
  let eventRepo: { findOne: jest.Mock; save: jest.Mock };
  let userRepo: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    eventRepo = { findOne: jest.fn(), save: jest.fn() };
    userRepo = { findOne: jest.fn(), save: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(Event), useValue: eventRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  // ── approveEvent ──────────────────────────────────────────────────────────

  describe('approveEvent', () => {
    it('publishes a draft event', async () => {
      const event = makeEvent(EventStatus.DRAFT);
      eventRepo.findOne.mockResolvedValue(event);
      eventRepo.save.mockImplementation(async (e: Event) => e);

      const result = await service.approveEvent('event-uuid');
      expect(result.status).toBe(EventStatus.PUBLISHED);
    });

    it('throws if event is not in draft', async () => {
      eventRepo.findOne.mockResolvedValue(makeEvent(EventStatus.PUBLISHED));
      await expect(service.approveEvent('event-uuid')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException for unknown event', async () => {
      eventRepo.findOne.mockResolvedValue(null);
      await expect(service.approveEvent('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── suspendEvent ──────────────────────────────────────────────────────────

  describe('suspendEvent', () => {
    it('cancels a published event', async () => {
      const event = makeEvent(EventStatus.PUBLISHED);
      eventRepo.findOne.mockResolvedValue(event);
      eventRepo.save.mockImplementation(async (e: Event) => e);

      const result = await service.suspendEvent('event-uuid');
      expect(result.status).toBe(EventStatus.CANCELLED);
    });

    it('throws if event is already cancelled', async () => {
      eventRepo.findOne.mockResolvedValue(makeEvent(EventStatus.CANCELLED));
      await expect(service.suspendEvent('event-uuid')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws if event is completed', async () => {
      eventRepo.findOne.mockResolvedValue(makeEvent(EventStatus.COMPLETED));
      await expect(service.suspendEvent('event-uuid')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── blockUser ─────────────────────────────────────────────────────────────

  describe('blockUser', () => {
    it('blocks an active user', async () => {
      const user = makeUser();
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation(async (u: User) => u);

      const result = await service.blockUser('user-uuid');
      expect((result as any).status).toBe('blocked');
    });

    it('throws if user is already blocked', async () => {
      const user = { ...makeUser(), status: 'blocked' };
      userRepo.findOne.mockResolvedValue(user);
      await expect(service.blockUser('user-uuid')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException for unknown user', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.blockUser('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
