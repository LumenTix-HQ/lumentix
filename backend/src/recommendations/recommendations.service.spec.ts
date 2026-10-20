import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { RecommendationsService } from './recommendations.service';
import { UserPreference } from './entities/user-preference.entity';
import { EventSimilarity } from './entities/event-similarity.entity';
import { Event, EventStatus } from './../events/entities/event.entity';

describe('RecommendationsService (#1243)', () => {
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
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        { provide: getRepositoryToken(UserPreference), useValue: mockPreferencesRepo },
        { provide: getRepositoryToken(EventSimilarity), useValue: mockSimilaritiesRepo },
        { provide: getRepositoryToken(Event), useValue: mockEventsRepo },
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

      const vector = await service.buildUserProfileVector('u-123');

      expect(vector.categoryWeights['Technology']).toBeCloseTo(120);
      expect(vector.categoryWeights['Food']).toBeUndefined();
      // Location dimension is blended 0.6 per the engine's scoring rule.
      expect(vector.locationWeights['Lagos']).toBeCloseTo(48);
      expect(vector.locationWeights['Abuja']).toBeCloseTo(24);
    });

    it('returns an empty profile when the user has no recorded preferences', async () => {
      mockPreferencesRepo.find.mockResolvedValue([]);

      const vector = await service.buildUserProfileVector('u-nobody');

      expect(vector.categoryWeights).toEqual({});
      expect(vector.locationWeights).toEqual({});
    });
  });

  describe('compute_similarity_scores', () => {
    it('boosts events whose category top the user’s weighted profile', async () => {
      mockPreferencesRepo.find.mockResolvedValue([
        preference({ category: 'Technology', location: 'Lagos', weight: 100, attendanceCount: 1 }),
      ]);

      const scores = await service.computeSimilarityScores(
        await service.buildUserProfileVector('u-123'),
        await service.listCandidateEvents(),
      );

      const tech = scores.find((s) => s.eventId === 'evt-tech-a');
      const food = scores.find((s) => s.eventId === 'evt-food-b');
      expect(tech).toBeDefined();
      // A category the user never attended scores zero on that dimension.
      expect(food).toBeDefined();
      expect(tech!.score).toBeGreaterThan(food!.score);
    });
  });

  describe('rank_recommendations', () => {
    it('returns a ranked recommendation response for the user', async () => {
      mockPreferencesRepo.find.mockResolvedValue([
        preference({ category: 'Technology', location: 'Lagos', weight: 90, attendanceCount: 4 }),
      ]);

      const result = await service.generateRecommendations('u-123');

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

    it('persists a user’s preference replacement set', async () => {
      const out = await service.updateUserPreferences('u-123', {
        preferences: [
          { category: 'Food', location: 'Lagos', weight: 70 },
        ],
      });

      expect(mockPreferencesRepo.delete).toHaveBeenCalledWith({ userId: 'u-123' });
      expect(out.saved).toBe(1);
    });
  });
});
