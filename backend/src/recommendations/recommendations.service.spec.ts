import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { RecommendationsService } from './recommendations.service';
import { UserPreference } from './entities/user-preference.entity';
import { EventSimilarity } from './entities/event-similarity.entity';
import { Event, EventStatus } from './../events/entities/event.entity';
import { Registration, RegistrationStatus } from '../registrations/entities/registration.entity';

describe('RecommendationsService (#1243, #1465)', () => {
  let service: RecommendationsService;

  const mockPreferencesRepo = {
    find: jest.fn(),
    save: jest.fn((rows) => Promise.resolve(rows)),
    delete: jest.fn(() => Promise.resolve({ affected: 1 }) as never),
  };
  const mockSimilaritiesRepo = { find: jest.fn(() => Promise.resolve([])) };
  const mockEventsRepo = {
    find: jest
      .fn()
      .mockResolvedValue([
        { id: 'evt-tech-a', title: 'Cloud Summit', category: 'Technology',
          location: 'Lagos', startDate: new Date('2026-07-01'),
          ticketPrice: 40, currency: 'NGN', status: EventStatus.PUBLISHED },
        { id: 'evt-food-b', title: 'Foodie Market', category: 'Food',
          location: 'Lagos', startDate: new Date('2026-07-15'),
          ticketPrice: 10, currency: 'NGN', status: EventStatus.PUBLISHED },
      ]),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
  };

  const mockRegistrationsRepo = {
    find: jest.fn(() => Promise.resolve([])),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    }),
  };

  const preference = (over: Partial<UserPreference> = {}) =>
    ({
      id: 'p1',
      userId: 'u-123',
      category: 'Technology',
      location: 'Lagos',
      weight: 80,
      attendanceCount: 3,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    }) as UserPreference;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset default mocks
    mockEventsRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });
    mockRegistrationsRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        { provide: getRepositoryToken(UserPreference), useValue: mockPreferencesRepo },
        { provide: getRepositoryToken(EventSimilarity), useValue: mockSimilaritiesRepo },
        { provide: getRepositoryToken(Event), useValue: mockEventsRepo },
        { provide: getRepositoryToken(Registration), useValue: mockRegistrationsRepo },
      ],
    }).compile();
    service = module.get(RecommendationsService);
  });

  describe('build_user_profile_vector', () => {
    it('collapses preferences into a weighted category/location vector', async () => {
      mockPreferencesRepo.find.mockResolvedValue([
        preference({ category: 'Technology', location: 'Lagos', weight: 80, attendanceCount: 3 }),
        preference({ category: 'Technology', location: 'Abuja', weight: 40, attendanceCount: 1 }),
      ]);
      mockRegistrationsRepo.find.mockResolvedValue([]);

      const vector = await service.buildUserProfileVector('u-123');

      expect(vector.categoryWeights['Technology']).toBeCloseTo(120);
      expect(vector.categoryWeights['Food']).toBeUndefined();
      // Location dimension is blended 0.6 per the engine's scoring rule.
      expect(vector.locationWeights['Lagos']).toBeCloseTo(48);
      expect(vector.locationWeights['Abuja']).toBeCloseTo(24);
    });

    it('returns an empty profile when the user has no recorded preferences', async () => {
      mockPreferencesRepo.find.mockResolvedValue([]);
      mockRegistrationsRepo.find.mockResolvedValue([]);

      const vector = await service.buildUserProfileVector('u-nobody');

      expect(vector.categoryWeights).toEqual({});
      expect(vector.locationWeights).toEqual({});
      expect(vector.attendedEventIds.size).toBe(0);
    });

    it('enriches the vector with registration history (#1465)', async () => {
      mockPreferencesRepo.find.mockResolvedValue([]);
      mockRegistrationsRepo.find.mockResolvedValue([
        { userId: 'u-123', eventId: 'evt-tech-a', status: RegistrationStatus.CONFIRMED },
      ]);
      mockEventsRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: 'evt-tech-a', category: 'Technology', location: 'Lagos' },
        ]),
      });

      const vector = await service.buildUserProfileVector('u-123');

      expect(vector.attendedEventIds.has('evt-tech-a')).toBe(true);
      expect(vector.categoryWeights['Technology']).toBeGreaterThan(0);
    });
  });

  describe('compute_similarity_scores', () => {
    it('boosts events whose category tops the user\'s weighted profile', async () => {
      mockPreferencesRepo.find.mockResolvedValue([
        preference({ category: 'Technology', location: 'Lagos', weight: 100, attendanceCount: 1 }),
      ]);
      mockRegistrationsRepo.find.mockResolvedValue([]);

      const scores = await service.computeSimilarityScores(
        await service.buildUserProfileVector('u-123'),
        await service.listCandidateEvents(),
      );

      const tech = scores.find((s) => s.eventId === 'evt-tech-a');
      const food = scores.find((s) => s.eventId === 'evt-food-b');
      expect(tech).toBeDefined();
      expect(food).toBeDefined();
      expect(tech!.score).toBeGreaterThan(food!.score);
    });

    it('filters out already-attended events (#1465)', async () => {
      mockPreferencesRepo.find.mockResolvedValue([
        preference({ category: 'Technology', location: 'Lagos', weight: 100, attendanceCount: 1 }),
      ]);
      mockRegistrationsRepo.find.mockResolvedValue([
        { userId: 'u-123', eventId: 'evt-tech-a', status: RegistrationStatus.CONFIRMED },
      ]);
      mockEventsRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: 'evt-tech-a', category: 'Technology', location: 'Lagos' },
        ]),
      });

      const vector = await service.buildUserProfileVector('u-123');
      const scores = await service.computeSimilarityScores(
        vector,
        await service.listCandidateEvents(),
      );

      // evt-tech-a is already attended and must not appear in the scored list.
      const tech = scores.find((s) => s.eventId === 'evt-tech-a');
      expect(tech).toBeUndefined();
    });
  });

  describe('rank_recommendations', () => {
    it('returns a ranked recommendation response for the user', async () => {
      mockPreferencesRepo.find.mockResolvedValue([
        preference({ category: 'Technology', location: 'Lagos', weight: 90, attendanceCount: 4 }),
      ]);
      mockRegistrationsRepo.find.mockResolvedValue([]);

      const result = await service.rankRecommendations('u-123');

      expect(result.userId).toBe('u-123');
      expect(result.generatedAt).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
      // Ranking must be monotonically non-increasing by score.
      const scores = result.recommendations.map((r) => r.score);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
      }
    });

    it('persists a user\'s preference replacement set', async () => {
      const out = await service.updateUserPreferences('u-123', {
        preferences: [
          { category: 'Food', location: 'Lagos', weight: 70 },
        ],
      });

      expect(mockPreferencesRepo.delete).toHaveBeenCalledWith({ userId: 'u-123' });
      expect(out.saved).toBe(1);
    });

    it('generateRecommendations delegates to rankRecommendations', async () => {
      mockPreferencesRepo.find.mockResolvedValue([
        preference({ category: 'Technology', location: 'Lagos', weight: 90, attendanceCount: 4 }),
      ]);
      mockRegistrationsRepo.find.mockResolvedValue([]);

      const direct = await service.generateRecommendations('u-123', 3);
      const ranked = await service.rankRecommendations('u-123', 3);

      expect(direct.userId).toBe(ranked.userId);
      expect(direct.recommendations.length).toBe(ranked.recommendations.length);
    });
  });
});
