import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { Event, EventStatus } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { RoleRequest } from '../users/entities/role-request.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { MailerService } from '../mailer/mailer.service';
import { StellarWebhookService } from '../stellar/stellar-webhook.service';
import { EventStateService } from '../events/state/event-state.service';
import { EventCacheService } from '../events/cache/event-cache.service';

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
    status: UserStatus.ACTIVE,
  }) as unknown as User;

describe('AdminService', () => {
  let service: AdminService;
  let eventRepo: { findOne: jest.Mock; save: jest.Mock };
  let userRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    createQueryBuilder?: jest.Mock;
  };
  let eventCacheService: { invalidateCacheEntry: jest.Mock };
  let auditService: { log: jest.Mock };
  let refreshTokenRepo: { update: jest.Mock };

  const makeUserQueryBuilder = (result: User | null) => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
    getCount: jest.fn().mockResolvedValue(result ? 1 : 0),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(result ? [result] : []),
  });

  beforeEach(async () => {
    eventRepo = { findOne: jest.fn(), save: jest.fn() };
    userRepo = { findOne: jest.fn(), save: jest.fn() };
    eventCacheService = { invalidateCacheEntry: jest.fn() };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    refreshTokenRepo = { update: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(Event), useValue: eventRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        {
          provide: getRepositoryToken(RoleRequest),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: refreshTokenRepo,
        },
        { provide: AuditService, useValue: auditService },
        { provide: MailerService, useValue: {} },
        { provide: StellarWebhookService, useValue: {} },
        EventStateService,
        { provide: EventCacheService, useValue: eventCacheService },
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

    it('rejects an archived event through the state machine', async () => {
      eventRepo.findOne.mockResolvedValue(makeEvent(EventStatus.ARCHIVED));

      await expect(service.approveEvent('event-uuid')).rejects.toThrow(
        BadRequestException,
      );
      expect(eventRepo.save).not.toHaveBeenCalled();
    });

    it('invalidates the cached event after approval', async () => {
      const event = makeEvent(EventStatus.DRAFT);
      eventRepo.findOne.mockResolvedValue(event);
      eventRepo.save.mockImplementation(async (e: Event) => e);

      await service.approveEvent('event-uuid');

      expect(eventCacheService.invalidateCacheEntry).toHaveBeenCalledWith(
        'event-uuid',
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

    it('rejects an archived event through the state machine', async () => {
      eventRepo.findOne.mockResolvedValue(makeEvent(EventStatus.ARCHIVED));

      await expect(service.suspendEvent('event-uuid')).rejects.toThrow(
        BadRequestException,
      );
      expect(eventRepo.save).not.toHaveBeenCalled();
    });

    it('invalidates the cached event after suspension', async () => {
      const event = makeEvent(EventStatus.PUBLISHED);
      eventRepo.findOne.mockResolvedValue(event);
      eventRepo.save.mockImplementation(async (e: Event) => e);

      await service.suspendEvent('event-uuid');

      expect(eventCacheService.invalidateCacheEntry).toHaveBeenCalledWith(
        'event-uuid',
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
      expect(result.status).toBe(UserStatus.BLOCKED);
    });

    it('throws if user is already blocked', async () => {
      const user = { ...makeUser(), status: UserStatus.BLOCKED };
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

  // ── unblockUser ───────────────────────────────────────────────────────────

  describe('unblockUser', () => {
    it('unblocks a blocked user', async () => {
      const user = { ...makeUser(), status: UserStatus.BLOCKED };
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation(async (u: User) => u);

      const result = await service.unblockUser('user-uuid');
      expect(result.status).toBe(UserStatus.ACTIVE);
    });

    it('throws if user is not blocked', async () => {
      const user = makeUser();
      userRepo.findOne.mockResolvedValue(user);
      await expect(service.unblockUser('user-uuid')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException for unknown user', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.unblockUser('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── getUserById ───────────────────────────────────────────────────────────

  describe('getUserById', () => {
    it('returns a user record without passwordHash', async () => {
      const user = makeUser();
      userRepo.createQueryBuilder = jest
        .fn()
        .mockReturnValue(makeUserQueryBuilder(user));

      const result = await service.getUserById('user-uuid');
      expect(result).toEqual(user);
    });

    it('throws NotFoundException when user missing', async () => {
      userRepo.createQueryBuilder = jest
        .fn()
        .mockReturnValue(makeUserQueryBuilder(null));

      await expect(service.getUserById('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── search_users ──────────────────────────────────────────────────────────

  describe('search_users', () => {
    it('returns paginated users matching criteria', async () => {
      const user = makeUser();
      const qb = makeUserQueryBuilder(user);
      userRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const result = await service.search_users({
        search: 'alice',
        role: UserRole.EVENT_GOER,
        status: UserStatus.ACTIVE,
        page: 1,
        limit: 10,
      });

      expect(userRepo.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(result.data).toEqual([user]);
      expect(result.total).toBe(1);
    });
  });

  // ── update_user_role ──────────────────────────────────────────────────────

  describe('update_user_role', () => {
    it('updates user role and logs audit action', async () => {
      const user = makeUser();
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation(async (u: User) => u);

      const result = await service.update_user_role(
        'user-uuid',
        UserRole.ORGANIZER,
      );

      expect(result.role).toBe(UserRole.ORGANIZER);
      expect(userRepo.save).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.USER_ROLE_UPDATED,
          userId: 'user-uuid',
          meta: { previousRole: UserRole.EVENT_GOER, newRole: UserRole.ORGANIZER },
        }),
      );
    });

    it('rejects an invalid role', async () => {
      const user = makeUser();
      userRepo.findOne.mockResolvedValue(user);

      await expect(
        service.update_user_role('user-uuid', 'SUPER_ADMIN' as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── suspend_user_account ──────────────────────────────────────────────────

  describe('suspend_user_account', () => {
    it('suspends an active account and logs audit action', async () => {
      const user = makeUser();
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation(async (u: User) => u);

      const result = await service.suspend_user_account('user-uuid');

      expect(result.status).toBe(UserStatus.BLOCKED);
      expect(userRepo.save).toHaveBeenCalled();
      expect(refreshTokenRepo.update).toHaveBeenCalledWith(
        { userId: 'user-uuid', revoked: false },
        { revoked: true },
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.USER_SUSPENDED,
          userId: 'user-uuid',
        }),
      );
    });

    it('throws if user is already suspended', async () => {
      const user = { ...makeUser(), status: UserStatus.BLOCKED };
      userRepo.findOne.mockResolvedValue(user);

      await expect(
        service.suspend_user_account('user-uuid'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
