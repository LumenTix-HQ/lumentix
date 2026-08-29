import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { ReviewSentimentService } from './review-sentiment.service';
import { EventReview, ReviewStatus } from './entities/event-review.entity';
import { AuditService } from '../audit/audit.service';

describe('ReviewSentimentService', () => {
  let service: ReviewSentimentService;

  const mockReviewRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((r) => Promise.resolve(r)),
  };
  const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

  const review = (over: Partial<EventReview> = {}) =>
    ({
      id: 'r1',
      eventId: 'e1',
      reviewerId: 'u1',
      organizerId: 'o1',
      ticketId: 't1',
      rating: 5,
      comment: null,
      status: ReviewStatus.VERIFIED,
      ...over,
    }) as EventReview;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewSentimentService,
        { provide: getRepositoryToken(EventReview), useValue: mockReviewRepo },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(ReviewSentimentService);
  });

  describe('analyzeReviewSentiment', () => {
    it('scores praise as positive', () => {
      const result = service.analyzeReviewSentiment('Absolutely amazing event');
      expect(result.label).toBe('positive');
      expect(result.score).toBeGreaterThan(0.5);
    });

    it('scores complaints as negative', () => {
      const result = service.analyzeReviewSentiment('Terrible, disorganised and overpriced');
      expect(result.label).toBe('negative');
      expect(result.score).toBeLessThan(-0.5);
    });

    it('inverts sentiment after a negator', () => {
      const positive = service.analyzeReviewSentiment('the sound was great');
      const negated = service.analyzeReviewSentiment('the sound was not great');

      expect(positive.label).toBe('positive');
      expect(negated.label).toBe('negative');
      expect(negated.score).toBeLessThan(positive.score);
    });

    it('scales sentiment with intensifiers', () => {
      const plain = service.analyzeReviewSentiment('good venue');
      const intense = service.analyzeReviewSentiment('extremely good venue');
      expect(intense.score).toBeGreaterThan(plain.score);
    });

    it('does not treat a long review as a more positive one', () => {
      const short = service.analyzeReviewSentiment('great');
      const long = service.analyzeReviewSentiment(
        'great. great. great. great. great. great.',
      );
      expect(long.score).toBeCloseTo(short.score, 5);
    });

    it('reports zero confidence for text with no sentiment signal', () => {
      const result = service.analyzeReviewSentiment('The event was on Tuesday.');
      expect(result.confidence).toBe(0);
      expect(result.label).toBe('neutral');
    });

    it('falls back to the star rating when the text says nothing', () => {
      const result = service.analyzeReviewSentiment('It happened.', 5);
      expect(result.label).toBe('positive');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('lets the text outweigh a contradicting rating', () => {
      const result = service.analyzeReviewSentiment(
        'Absolutely amazing, perfect, unforgettable',
        1,
      );
      expect(result.label).toBe('positive');
    });

    it('handles a null comment without throwing', () => {
      expect(service.analyzeReviewSentiment(null).score).toBe(0);
      expect(service.analyzeReviewSentiment(null, 4).label).toBe('positive');
    });

    it('attributes sentiment to the theme it was said about', () => {
      const result = service.analyzeReviewSentiment(
        'The venue was excellent but the queue was terrible',
      );
      const venue = result.themes.find((t) => t.theme === 'venue');
      const organisation = result.themes.find((t) => t.theme === 'organisation');

      expect(venue!.score).toBeGreaterThan(0);
      expect(organisation!.score).toBeLessThan(0);
    });
  });

  describe('generateSentimentSummary', () => {
    it('returns an empty summary when there are no verified reviews', async () => {
      mockReviewRepo.find.mockResolvedValue([]);

      const summary = await service.generateSentimentSummary('e1');

      expect(summary.reviewsAnalysed).toBe(0);
      expect(summary.averageRating).toBeNull();
      expect(summary.summary).toContain('No verified reviews');
    });

    it('counts only verified reviews', async () => {
      mockReviewRepo.find.mockResolvedValue([review({ comment: 'great' })]);

      await service.generateSentimentSummary('e1');

      const where = mockReviewRepo.find.mock.calls[0][0].where;
      expect(where.eventId).toBe('e1');
      expect(where.status.value).toEqual([ReviewStatus.VERIFIED]);
    });

    it('separates recurring praise from recurring complaints', async () => {
      mockReviewRepo.find.mockResolvedValue([
        review({ id: 'r1', comment: 'The venue was excellent', rating: 5 }),
        review({ id: 'r2', comment: 'Lovely venue, superb seating', rating: 5 }),
        review({ id: 'r3', comment: 'The queue was terrible', rating: 2 }),
        review({ id: 'r4', comment: 'Awful entry queue, so slow', rating: 1 }),
      ]);

      const summary = await service.generateSentimentSummary('e1');

      expect(summary.reviewsAnalysed).toBe(4);
      expect(summary.commonPraise.map((p) => p.theme)).toContain('venue');
      expect(summary.commonComplaints.map((c) => c.theme)).toContain(
        'organisation',
      );
      expect(summary.summary).toContain('venue');
    });

    it('reports the sentiment distribution and average rating', async () => {
      mockReviewRepo.find.mockResolvedValue([
        review({ id: 'r1', comment: 'amazing', rating: 5 }),
        review({ id: 'r2', comment: 'terrible', rating: 1 }),
      ]);

      const summary = await service.generateSentimentSummary('e1');

      expect(summary.distribution.positive).toBe(1);
      expect(summary.distribution.negative).toBe(1);
      expect(summary.averageRating).toBe(3);
    });
  });

  describe('flagToxicReview', () => {
    it('throws when the review does not exist', async () => {
      mockReviewRepo.findOne.mockResolvedValue(null);
      await expect(service.flagToxicReview('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('leaves a harshly negative but non-abusive review visible', async () => {
      mockReviewRepo.findOne.mockResolvedValue(
        review({ comment: 'Worst event ever. Awful sound, overpriced, disorganised.', rating: 1 }),
      );

      const result = await service.flagToxicReview('r1');

      expect(result.isToxic).toBe(false);
      expect(result.flagged).toBe(false);
      expect(mockReviewRepo.save).not.toHaveBeenCalled();
    });

    it('flags abuse aimed at people and withholds the review', async () => {
      const target = review({
        comment: 'The organisers are thieves and liars, kill yourself',
      });
      mockReviewRepo.findOne.mockResolvedValue(target);

      const result = await service.flagToxicReview('r1');

      expect(result.isToxic).toBe(true);
      expect(result.flagged).toBe(true);
      expect(result.severity).toBeGreaterThanOrEqual(0.5);
      expect(target.status).toBe(ReviewStatus.FLAGGED);
      expect(mockReviewRepo.save).toHaveBeenCalledWith(target);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REVIEW_FLAGGED_TOXIC' }),
      );
    });

    it('does not re-log an already flagged review', async () => {
      mockReviewRepo.findOne.mockResolvedValue(
        review({ comment: 'kill yourself', status: ReviewStatus.FLAGGED }),
      );

      const result = await service.flagToxicReview('r1');

      expect(result.flagged).toBe(true);
      expect(mockReviewRepo.save).not.toHaveBeenCalled();
      expect(mockAudit.log).not.toHaveBeenCalled();
    });

    it('scores several mild insults below one severe threat', async () => {
      mockReviewRepo.findOne.mockResolvedValue(
        review({ comment: 'stupid clowns, total garbage' }),
      );
      const mild = await service.flagToxicReview('r1');

      mockReviewRepo.findOne.mockResolvedValue(
        review({ id: 'r2', comment: 'I will find you' }),
      );
      const severe = await service.flagToxicReview('r2');

      expect(severe.severity).toBeGreaterThan(mild.severity);
    });
  });
});
