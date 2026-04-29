import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RegistrationsService } from './registrations.service';
import { Registration, RegistrationStatus } from './entities/registration.entity';
import { EventsService } from '../events/events.service';
import { RefundService } from '../payments/refunds/refund.service';
import { AuditService } from '../audit/audit.service';
import { Event, EventStatus } from '../events/entities/event.entity';

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
});

const PUBLISHED_EVENT = {
  id: 'event-1',
  status: EventStatus.PUBLISHED,
  maxAttendees: 10,
  organizerId: 'org-1',
} as Event;

const ACTIVE_REGISTRATION = {
  id: 'reg-1',
  eventId: 'event-1',
  userId: 'user-1',
  status: RegistrationStatus.CONFIRMED,
} as Registration;

describe('RegistrationsService', () => {
  let service: RegistrationsService;
  let registrationRepo: ReturnType<typeof mockRepo>;
  let eventsService: jest.Mocked<Pick<EventsService, 'getEventById'>>;
  let refundService: jest.Mocked<Pick<RefundService, 'refundSinglePayment'>>;
  let auditService: jest.Mocked<Pick<AuditService, 'log'>>;
  let dataSource: jest.Mocked<Pick<DataSource, 'transaction'>>;

  beforeEach(async () => {
    registrationRepo = mockRepo();
    eventsService = { getEventById: jest.fn() };
    refundService = { refundSinglePayment: jest.fn() };
    auditService = { log: jest.fn().mockResolvedValue({}) };
    dataSource = { transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationsService,
        { provide: getRepositoryToken(Registration), useValue: registrationRepo },
        { provide: EventsService, useValue: eventsService },
        { provide: RefundService, useValue: refundService },
        { provide: AuditService, useValue: auditService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(RegistrationsService);
  });

  // ─── register() ──────────────────────────────────────────────────────────

  describe('register()', () => {
    it('throws BadRequestException when event is not PUBLISHED', async () => {
      eventsService.getEventById.mockResolvedValue({
        ...PUBLISHED_EVENT,
        status: EventStatus.DRAFT,
      } as Event);

      await expect(service.register('event-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ConflictException when user already has an active registration', async () => {
      eventsService.getEventById.mockResolvedValue(PUBLISHED_EVENT);
      registrationRepo.findOne.mockResolvedValue(ACTIVE_REGISTRATION);

      await expect(service.register('event-1', 'user-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates WAITLISTED registration when event is at capacity', async () => {
      eventsService.getEventById.mockResolvedValue(PUBLISHED_EVENT);
      registrationRepo.findOne.mockResolvedValue(null); // no duplicate
      registrationRepo.count.mockResolvedValue(10); // at capacity
      const created = { ...ACTIVE_REGISTRATION, status: RegistrationStatus.WAITLISTED };
      registrationRepo.create.mockReturnValue(created);
      registrationRepo.save.mockResolvedValue(created);

      const result = await service.register('event-1', 'user-1');

      expect(result.registration.status).toBe(RegistrationStatus.WAITLISTED);
    });

    it('creates PENDING registration when event has capacity', async () => {
      eventsService.getEventById.mockResolvedValue(PUBLISHED_EVENT);
      registrationRepo.findOne.mockResolvedValue(null);
      registrationRepo.count.mockResolvedValue(5); // under capacity
      const created = { ...ACTIVE_REGISTRATION, status: RegistrationStatus.PENDING };
      registrationRepo.create.mockReturnValue(created);
      registrationRepo.save.mockResolvedValue(created);

      const result = await service.register('event-1', 'user-1');

      expect(result.registration.status).toBe(RegistrationStatus.PENDING);
    });

    it('creates PENDING registration when event has no maxAttendees (unlimited)', async () => {
      eventsService.getEventById.mockResolvedValue({
        ...PUBLISHED_EVENT,
        maxAttendees: null,
      } as any);
      registrationRepo.findOne.mockResolvedValue(null);
      const created = { ...ACTIVE_REGISTRATION, status: RegistrationStatus.PENDING };
      registrationRepo.create.mockReturnValue(created);
      registrationRepo.save.mockResolvedValue(created);

      const result = await service.register('event-1', 'user-1');

      expect(result.registration.status).toBe(RegistrationStatus.PENDING);
    });
  });

  // ─── cancel() ────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('throws NotFoundException when registration not found', async () => {
      registrationRepo.findOne.mockResolvedValue(null);

      await expect(service.cancel('reg-missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when caller does not own the registration', async () => {
      registrationRepo.findOne.mockResolvedValue(ACTIVE_REGISTRATION);

      await expect(service.cancel('reg-1', 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when registration is not cancellable', async () => {
      registrationRepo.findOne.mockResolvedValue({
        ...ACTIVE_REGISTRATION,
        status: RegistrationStatus.CANCELLED,
      });

      await expect(service.cancel('reg-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('cancels a CONFIRMED registration successfully', async () => {
      registrationRepo.findOne.mockResolvedValue(ACTIVE_REGISTRATION);
      const cancelled = { ...ACTIVE_REGISTRATION, status: RegistrationStatus.CANCELLED };
      registrationRepo.save.mockResolvedValue(cancelled);

      const result = await service.cancel('reg-1', 'user-1');

      expect(result.status).toBe(RegistrationStatus.CANCELLED);
    });
  });
});
