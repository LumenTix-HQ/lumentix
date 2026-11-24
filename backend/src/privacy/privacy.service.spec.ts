import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrivacyService } from './privacy.service';

describe('PrivacyService', () => {
  let service: PrivacyService;

  let usersRepo: any;
  let ticketsRepo: any;
  let registrationsRepo: any;
  let reviewsRepo: any;
  let chatMessageRepo: any;
  let loyaltyAccountRepo: any;
  let loyaltyTransactionRepo: any;
  let loyaltyDiscountRepo: any;
  let insurancePolicyRepo: any;
  let userAchievementRepo: any;
  let userBadgeRepo: any;
  let socialProfileRepo: any;
  let attendeeConnectionRepo: any;
  let paymentRepo: any;
  let deletionRequestRepo: any;

  const mockUser = {
    id: 'user-123',
    email: 'alice@example.com',
    passwordHash: 'hashed_secret',
    deletedAt: null,
  };

  beforeEach(() => {
    usersRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
    };
    ticketsRepo = { find: jest.fn().mockResolvedValue([]) };
    registrationsRepo = { find: jest.fn().mockResolvedValue([]) };
    reviewsRepo = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 2 }),
    };
    chatMessageRepo = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 5 }),
    };
    loyaltyAccountRepo = { findOne: jest.fn().mockResolvedValue(null) };
    loyaltyTransactionRepo = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    loyaltyDiscountRepo = { find: jest.fn().mockResolvedValue([]) };
    insurancePolicyRepo = { find: jest.fn().mockResolvedValue([]) };
    userAchievementRepo = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 3 }),
    };
    userBadgeRepo = { find: jest.fn().mockResolvedValue([]) };
    socialProfileRepo = {
      findOne: jest.fn().mockResolvedValue({
        userId: 'user-123',
        displayName: 'Alice',
        bio: 'Hello world',
      }),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
    };
    attendeeConnectionRepo = {
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(0),
    };
    paymentRepo = { find: jest.fn().mockResolvedValue([]) };
    deletionRequestRepo = {
      create: jest.fn().mockImplementation((val) => ({ id: 'req-1', ...val })),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
      findOne: jest.fn(),
    };

    service = new PrivacyService(
      usersRepo,
      ticketsRepo,
      registrationsRepo,
      reviewsRepo,
      chatMessageRepo,
      loyaltyAccountRepo,
      loyaltyTransactionRepo,
      loyaltyDiscountRepo,
      insurancePolicyRepo,
      userAchievementRepo,
      userBadgeRepo,
      socialProfileRepo,
      attendeeConnectionRepo,
      paymentRepo,
      deletionRequestRepo,
    );
  });

  describe('exportUserData / export_user_data', () => {
    it('returns complete GDPR Article 15 user data export', async () => {
      usersRepo.findOne.mockResolvedValue(mockUser);
      ticketsRepo.find.mockResolvedValue([{ id: 'ticket-1' }]);

      const result = await service.export_user_data('user-123');

      expect(result).toBeDefined();
      expect(result.profile.id).toBe('user-123');
      expect((result.profile as any).passwordHash).toBeUndefined();
      expect(result.tickets).toHaveLength(1);
      expect(result.coverageNote).toContain('Complete GDPR Article 15 export');
    });

    it('throws NotFoundException if user is not found', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.export_user_data('unknown-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('requestDataDeletion / request_data_deletion', () => {
    it('creates pending deletion request and marks deletedAt', async () => {
      usersRepo.findOne.mockResolvedValue({ ...mockUser });

      const result = await service.request_data_deletion('user-123', 'user-123');

      expect(result.status).toBe('pending');
      expect(usersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user-123',
          deletedAt: expect.any(Date),
        }),
      );
    });

    it('throws ForbiddenException if requesting deletion for another user', async () => {
      await expect(
        service.request_data_deletion('user-123', 'attacker-456'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException if user is already marked deleted', async () => {
      usersRepo.findOne.mockResolvedValue({
        ...mockUser,
        deletedAt: new Date(),
      });

      await expect(
        service.request_data_deletion('user-123', 'user-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('anonymizeHistoricalRecords / anonymize_historical_records', () => {
    it('anonymizes records and completes deletion request', async () => {
      deletionRequestRepo.findOne.mockResolvedValue({
        id: 'req-1',
        userId: 'user-123',
        status: 'pending',
        requestedAt: new Date(),
      });
      usersRepo.findOne.mockResolvedValue({ ...mockUser });

      const result = await service.anonymize_historical_records(
        'user-123',
        'user-123',
      );

      expect(result.userId).toBe('user-123');
      expect(result.recordsAnonymized.reviews).toBe(2);
      expect(result.recordsAnonymized.chatMessages).toBe(5);
      expect(result.recordsAnonymized.loyaltyTransactions).toBe(1);
      expect(result.recordsAnonymized.achievements).toBe(3);
      expect(reviewsRepo.update).toHaveBeenCalledWith(
        { authorId: 'user-123' },
        { body: null },
      );
      expect(chatMessageRepo.update).toHaveBeenCalledWith(
        { userId: 'user-123' },
        { message: '[deleted]', username: 'Deleted User' },
      );
      expect(usersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: expect.stringContaining('@anonymized.local'),
        }),
      );
      expect(deletionRequestRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
        }),
      );
    });

    it('throws ForbiddenException if anonymizing another user', async () => {
      await expect(
        service.anonymize_historical_records('user-123', 'other-456'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException if no pending deletion request exists', async () => {
      deletionRequestRepo.findOne.mockResolvedValue(null);

      await expect(
        service.anonymize_historical_records('user-123', 'user-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
