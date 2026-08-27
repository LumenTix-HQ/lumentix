import { Test, TestingModule } from '@nestjs/testing';
import { AgeVerificationService } from './age-verification.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AgeVerification, AgeRestriction, VerificationStatus } from './entities/age-verification.entity';
import { Event, EventStatus } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

describe('AgeVerificationService', () => {
  let service: AgeVerificationService;
  let mockAgeRepo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let mockEventRepo: { findOne: jest.Mock; save: jest.Mock };
  let mockUserRepo: { findOne: jest.Mock };
  let mockAuditService: { log: jest.Mock };

  beforeEach(async () => {
    mockAgeRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn(() => ({})),
      save: jest.fn((r) => Promise.resolve({ ...r, id: 'av1', verifiedAt: new Date() })),
    };
    mockEventRepo = {
      findOne: jest.fn(),
      save: jest.fn((e) => Promise.resolve(e)),
    };
    mockUserRepo = { findOne: jest.fn() };
    mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgeVerificationService,
        { provide: getRepositoryToken(AgeVerification), useValue: mockAgeRepo },
        { provide: getRepositoryToken(Event), useValue: mockEventRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<AgeVerificationService>(AgeVerificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyAge', () => {
    it('should throw NotFoundException when event not found', async () => {
      mockEventRepo.findOne.mockResolvedValue(null);

      await expect(
        service.verifyAge('u1', { eventId: 'e1', dateOfBirth: '2000-01-01' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return compliant when event has no age restriction', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'e1', ageRestriction: undefined });

      const result = await service.verifyAge('u1', { eventId: 'e1' } as any);

      expect(result.isCompliant).toBe(true);
      expect(result.requiredRestriction).toBe(AgeRestriction.NONE);
    });

    it('should throw ForbiddenException when user is underage', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'e1', ageRestriction: AgeRestriction.EIGHTEEN_PLUS });
      mockUserRepo.findOne.mockResolvedValue({ id: 'u1' });

      const currentYear = new Date().getFullYear();
      await expect(
        service.verifyAge('u1', { eventId: 'e1', dateOfBirth: `${currentYear - 10}-01-01` } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should succeed when user meets age requirement', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'e1', ageRestriction: AgeRestriction.EIGHTEEN_PLUS });
      mockUserRepo.findOne.mockResolvedValue({ id: 'u1' });
      mockAgeRepo.findOne.mockResolvedValue(null);

      const result = await service.verifyAge('u1', {
        eventId: 'e1',
        dateOfBirth: '1990-01-01',
      } as any);

      expect(result.isCompliant).toBe(true);
      expect(mockAuditService.log).toHaveBeenCalled();
    });

    it('should throw BadRequestException when DOB not provided and no existing record', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'e1', ageRestriction: AgeRestriction.EIGHTEEN_PLUS });
      mockAgeRepo.findOne.mockResolvedValue(null);

      await expect(
        service.verifyAge('u1', { eventId: 'e1' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('setAgeRestriction', () => {
    it('should throw NotFoundException when event not found', async () => {
      mockEventRepo.findOne.mockResolvedValue(null);

      await expect(
        service.setAgeRestriction('e1', 'org1', { ageRestriction: AgeRestriction.EIGHTEEN_PLUS }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-organizer', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'e1', organizerId: 'org1', status: EventStatus.DRAFT });

      await expect(
        service.setAgeRestriction('e1', 'other', { ageRestriction: AgeRestriction.EIGHTEEN_PLUS }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when event is not DRAFT', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'e1', organizerId: 'org1', status: EventStatus.PUBLISHED });

      await expect(
        service.setAgeRestriction('e1', 'org1', { ageRestriction: AgeRestriction.EIGHTEEN_PLUS }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set age restriction on DRAFT event', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'e1', organizerId: 'org1', status: EventStatus.DRAFT });

      const result = await service.setAgeRestriction('e1', 'org1', { ageRestriction: AgeRestriction.TWENTY_ONE_PLUS });

      expect(result.ageRestriction).toBe(AgeRestriction.TWENTY_ONE_PLUS);
      expect(mockEventRepo.save).toHaveBeenCalled();
    });
  });
});
