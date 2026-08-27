import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RatingSummary {
  reviewableType: string;
  reviewableId: string;
  averageRating: number;
  totalReviews: number;
  distribution: Record<number, number>;
}

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
  ) {}

  /** Create a review. Each author may only review a resource once. */
  async createReview(dto: CreateReviewDto, authorId: string): Promise<Review> {
    const existing = await this.reviewRepo.findOne({
      where: {
        authorId,
        reviewableType: dto.reviewableType,
        reviewableId: dto.reviewableId,
      },
    });
    if (existing) {
      throw new ConflictException(
        'You have already submitted a review for this resource.',
      );
    }

    const review = this.reviewRepo.create({ ...dto, authorId });
    return this.reviewRepo.save(review);
  }

  /** List reviews with optional filters. */
  async listReviews(dto: ListReviewsDto): Promise<PaginatedResult<Review>> {
    const { reviewableType, reviewableId, page = 1, limit = 10 } = dto;

    const qb = this.reviewRepo
      .createQueryBuilder('review')
      .where('review.isPublished = :pub', { pub: true });

    if (reviewableType) {
      qb.andWhere('review.reviewableType = :reviewableType', { reviewableType });
    }
    if (reviewableId) {
      qb.andWhere('review.reviewableId = :reviewableId', { reviewableId });
    }

    qb.orderBy('review.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Get a single review by ID. */
  async getReview(id: string): Promise<Review> {
    const review = await this.reviewRepo.findOne({ where: { id } });
    if (!review) throw new NotFoundException(`Review "${id}" not found.`);
    return review;
  }

  /** Get aggregated rating stats for a resource. */
  async getRatingSummary(
    reviewableType: string,
    reviewableId: string,
  ): Promise<RatingSummary> {
    const rows = await this.reviewRepo
      .createQueryBuilder('review')
      .select('review.rating', 'rating')
      .addSelect('COUNT(*)', 'count')
      .where('review.reviewableType = :reviewableType', { reviewableType })
      .andWhere('review.reviewableId = :reviewableId', { reviewableId })
      .andWhere('review.isPublished = true')
      .groupBy('review.rating')
      .getRawMany<{ rating: string; count: string }>();

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalReviews = 0;
    let ratingSum = 0;

    for (const row of rows) {
      const rating = Number(row.rating);
      const count = Number(row.count);
      distribution[rating] = count;
      totalReviews += count;
      ratingSum += rating * count;
    }

    const averageRating =
      totalReviews > 0
        ? Math.round((ratingSum / totalReviews) * 10) / 10
        : 0;

    return { reviewableType, reviewableId, averageRating, totalReviews, distribution };
  }

  /** Delete own review. Admins may delete any review. */
  async deleteReview(id: string, requesterId: string, isAdmin: boolean): Promise<void> {
    const review = await this.getReview(id);
    if (!isAdmin && review.authorId !== requesterId) {
      throw new ForbiddenException('You can only delete your own reviews.');
    }
    await this.reviewRepo.remove(review);
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { EventReview, ReviewStatus } from './entities/event-review.entity';
import { OrganizerReputation } from './entities/organizer-reputation.entity';
import { SubmitReviewDto } from './dto/submit-review.dto';
import {
  AttendanceVerificationResultDto,
  ReputationScoreDto,
  ReviewResponseDto,
} from './dto/review-response.dto';

import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Event, EventStatus } from '../events/entities/event.entity';
import { AuditService } from '../audit/audit.service';
import { paginate } from '../common/pagination/pagination.helper';
import { PaginationDto } from '../common/pagination/dto/pagination.dto';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @InjectRepository(EventReview)
    private readonly reviewRepo: Repository<EventReview>,

    @InjectRepository(OrganizerReputation)
    private readonly reputationRepo: Repository<OrganizerReputation>,

    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,

    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,

    private readonly auditService: AuditService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // submit_event_review
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Submit a blockchain-anchored review for a completed event.
   *
   * Anti-fake-review flow:
   *  1. Verify the ticket exists and belongs to the reviewer.
   *  2. Verify the ticket status is 'used' (checked-in at the event).
   *  3. Verify the event is COMPLETED (can't review a future event).
   *  4. Enforce one-review-per-attendee-per-event uniqueness.
   *  5. Persist the review with status PENDING.
   *  6. Immediately run validate_reviewer_attendance to flip it to VERIFIED.
   *
   * The review is only surfaced publicly once status = VERIFIED.
   */
  async submitEventReview(
    reviewerId: string,
    dto: SubmitReviewDto,
  ): Promise<ReviewResponseDto> {
    // 1. Load and validate the ticket
    const ticket = await this.ticketRepo.findOne({
      where: { id: dto.ticketId },
    });
    if (!ticket) {
      throw new NotFoundException(`Ticket "${dto.ticketId}" not found.`);
    }
    if (ticket.ownerId !== reviewerId) {
      throw new ForbiddenException(
        'You do not own this ticket and cannot review this event.',
      );
    }
    if (ticket.eventId !== dto.eventId) {
      throw new BadRequestException(
        'The provided ticket does not belong to the specified event.',
      );
    }

    // 2. Attendance gate — ticket must have been used (scanned at the door)
    if (ticket.status !== 'used') {
      throw new BadRequestException(
        `Attendance verification failed: ticket status is "${ticket.status}". ` +
          'Only attendees who checked in (status: "used") may submit reviews.',
      );
    }

    // 3. Load the event
    const event = await this.eventRepo.findOne({
      where: { id: dto.eventId },
    });
    if (!event) {
      throw new NotFoundException(`Event "${dto.eventId}" not found.`);
    }
    if (event.status !== EventStatus.COMPLETED) {
      throw new BadRequestException(
        `Reviews can only be submitted for completed events. ` +
          `Current event status: "${event.status}".`,
      );
    }

    // 4. One review per attendee per event
    const existing = await this.reviewRepo.findOne({
      where: { reviewerId, eventId: dto.eventId },
    });
    if (existing) {
      throw new ConflictException(
        'You have already submitted a review for this event.',
      );
    }

    // 5. Persist the review (starts as PENDING)
    const review = this.reviewRepo.create({
      eventId: dto.eventId,
      reviewerId,
      organizerId: event.organizerId,
      ticketId: dto.ticketId,
      rating: dto.rating,
      comment: dto.comment ?? null,
      attendanceVerified: false,
      status: ReviewStatus.PENDING,
      blockchainTxHash: null,
      verifiedAt: null,
    });

    const saved = await this.reviewRepo.save(review);

    // 6. Immediately verify attendance (ticket.status === 'used' already confirmed above)
    const verificationResult = await this.validateReviewerAttendance(saved.id);

    await this.auditService.log({
      action: 'REVIEW_SUBMITTED',
      userId: reviewerId,
      resourceId: saved.id,
      meta: {
        eventId: dto.eventId,
        ticketId: dto.ticketId,
        rating: dto.rating,
        verified: verificationResult.verified,
      },
    });

    this.logger.log(
      `Review submitted: reviewId=${saved.id} eventId=${dto.eventId} ` +
        `reviewerId=${reviewerId} rating=${dto.rating} verified=${verificationResult.verified}`,
    );

    return verificationResult.review;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // validate_reviewer_attendance
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Verify that the reviewer actually attended the event.
   *
   * Verification checks (all must pass):
   *  a) The review's linked ticket exists.
   *  b) The ticket owner matches the reviewer (no ticket-borrowing).
   *  c) The ticket status is 'used' (physically checked in).
   *  d) The ticket belongs to the correct event.
   *
   * On success: review.attendanceVerified = true, status = VERIFIED.
   * On failure: review.status = REJECTED with a reason.
   *
   * This function is idempotent — calling it on an already-verified review
   * returns the current state without re-processing.
   */
  async validateReviewerAttendance(
    reviewId: string,
  ): Promise<AttendanceVerificationResultDto> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException(`Review "${reviewId}" not found.`);
    }

    // Idempotent — already processed
    if (
      review.status === ReviewStatus.VERIFIED ||
      review.status === ReviewStatus.REJECTED
    ) {
      return {
        verified: review.attendanceVerified,
        review: this.toDto(review),
        reason:
          review.status === ReviewStatus.REJECTED
            ? 'Review was previously rejected'
            : undefined,
      };
    }

    // Load the ticket
    const ticket = await this.ticketRepo.findOne({
      where: { id: review.ticketId },
    });

    let failReason: string | undefined;

    if (!ticket) {
      failReason = 'Linked ticket no longer exists.';
    } else if (ticket.ownerId !== review.reviewerId) {
      failReason = 'Ticket owner does not match the reviewer.';
    } else if (ticket.eventId !== review.eventId) {
      failReason = 'Ticket does not belong to the reviewed event.';
    } else if (ticket.status !== 'used') {
      failReason = `Ticket has not been checked in (status: "${ticket.status}"). Attendance cannot be confirmed.`;
    }

    if (failReason) {
      review.status = ReviewStatus.REJECTED;
      review.attendanceVerified = false;
      await this.reviewRepo.save(review);

      this.logger.warn(
        `Attendance verification failed: reviewId=${reviewId} reason="${failReason}"`,
      );

      return { verified: false, review: this.toDto(review), reason: failReason };
    }

    // All checks passed — mark as verified
    review.attendanceVerified = true;
    review.status = ReviewStatus.VERIFIED;
    review.verifiedAt = new Date();
    const updated = await this.reviewRepo.save(review);

    // Recalculate the organizer's reputation score asynchronously
    this.calculateReputationScore(review.organizerId).catch((err) =>
      this.logger.error(
        `Reputation recalculation failed for organizer ${review.organizerId}`,
        err,
      ),
    );

    this.logger.log(
      `Attendance verified: reviewId=${reviewId} eventId=${review.eventId} ` +
        `reviewerId=${review.reviewerId}`,
    );

    return { verified: true, review: this.toDto(updated) };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // calculate_reputation_score
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Compute and persist a weighted reputation score for an organizer.
   *
   * Score components (total 100 pts):
   *   base        = (averageRating / 5) × 60   — quality signal
   *   volume      = min(totalReviews / 50, 1) × 20  — credibility from volume
   *   consistency = max(0, 1 − stdDev / 2) × 20    — penalises high variance
   *
   * Only VERIFIED reviews are counted.
   * The result is upserted into organizer_reputations.
   */
  async calculateReputationScore(organizerId: string): Promise<ReputationScoreDto> {
    // Fetch all verified reviews for this organizer
    const reviews = await this.reviewRepo.find({
      where: { organizerId, status: ReviewStatus.VERIFIED },
      select: ['rating'],
    });

    const totalReviews = reviews.length;

    if (totalReviews === 0) {
      const empty = await this.upsertReputation(organizerId, {
        reputationScore: 0,
        averageRating: 0,
        totalReviews: 0,
        ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        ratingStdDev: 0,
      });
      return this.toReputationDto(empty);
    }

    // Build distribution and compute mean
    const distribution: Record<string, number> = {
      '1': 0, '2': 0, '3': 0, '4': 0, '5': 0,
    };
    let sum = 0;
    for (const r of reviews) {
      sum += r.rating;
      distribution[String(r.rating)] = (distribution[String(r.rating)] ?? 0) + 1;
    }
    const averageRating = sum / totalReviews;

    // Standard deviation
    const variance =
      reviews.reduce((acc, r) => acc + Math.pow(r.rating - averageRating, 2), 0) /
      totalReviews;
    const stdDev = Math.sqrt(variance);

    // Score formula
    const baseScore = (averageRating / 5) * 60;
    const volumeScore = Math.min(totalReviews / 50, 1) * 20;
    const consistencyScore = Math.max(0, 1 - stdDev / 2) * 20;
    const reputationScore = Math.round((baseScore + volumeScore + consistencyScore) * 100) / 100;

    const updated = await this.upsertReputation(organizerId, {
      reputationScore,
      averageRating: Math.round(averageRating * 100) / 100,
      totalReviews,
      ratingDistribution: distribution,
      ratingStdDev: Math.round(stdDev * 1000) / 1000,
    });

    this.logger.log(
      `Reputation recalculated: organizerId=${organizerId} ` +
        `score=${reputationScore} avg=${averageRating.toFixed(2)} reviews=${totalReviews}`,
    );

    return this.toReputationDto(updated);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────────────

  /** Get all verified reviews for an event (public). */
  async getEventReviews(eventId: string, dto: PaginationDto) {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException(`Event "${eventId}" not found.`);

    const qb: SelectQueryBuilder<EventReview> = this.reviewRepo
      .createQueryBuilder('review')
      .where('review.eventId = :eventId', { eventId })
      .andWhere('review.status = :status', { status: ReviewStatus.VERIFIED });

    return paginate(qb, dto, 'review');
  }

  /** Get all reviews written by the current user. */
  async getMyReviews(reviewerId: string, dto: PaginationDto) {
    const qb = this.reviewRepo
      .createQueryBuilder('review')
      .where('review.reviewerId = :reviewerId', { reviewerId });

    return paginate(qb, dto, 'review');
  }

  /** Get a single review by ID. Reviewer or organizer may access it. */
  async getReviewById(
    reviewId: string,
    requesterId: string,
  ): Promise<ReviewResponseDto> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException(`Review "${reviewId}" not found.`);

    if (review.reviewerId !== requesterId && review.organizerId !== requesterId) {
      throw new ForbiddenException('You do not have access to this review.');
    }

    return this.toDto(review);
  }

  /** Get the reputation score for an organizer (public). */
  async getOrganizerReputation(organizerId: string): Promise<ReputationScoreDto> {
    const rep = await this.reputationRepo.findOne({ where: { organizerId } });
    if (!rep) {
      // Return a zero-score DTO if no reviews yet
      return {
        organizerId,
        reputationScore: 0,
        averageRating: 0,
        totalReviews: 0,
        ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        ratingStdDev: 0,
        lastCalculatedAt: new Date(),
      };
    }
    return this.toReputationDto(rep);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async upsertReputation(
    organizerId: string,
    data: {
      reputationScore: number;
      averageRating: number;
      totalReviews: number;
      ratingDistribution: Record<string, number>;
      ratingStdDev: number;
    },
  ): Promise<OrganizerReputation> {
    let rep = await this.reputationRepo.findOne({ where: { organizerId } });

    if (!rep) {
      rep = this.reputationRepo.create({ organizerId });
    }

    rep.reputationScore = data.reputationScore;
    rep.averageRating = data.averageRating;
    rep.totalReviews = data.totalReviews;
    rep.ratingDistribution = data.ratingDistribution;
    rep.ratingStdDev = data.ratingStdDev;

    return this.reputationRepo.save(rep);
  }

  private toDto(review: EventReview): ReviewResponseDto {
    return {
      id: review.id,
      eventId: review.eventId,
      reviewerId: review.reviewerId,
      organizerId: review.organizerId,
      ticketId: review.ticketId,
      rating: review.rating,
      comment: review.comment,
      attendanceVerified: review.attendanceVerified,
      status: review.status,
      blockchainTxHash: review.blockchainTxHash,
      verifiedAt: review.verifiedAt,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }

  private toReputationDto(rep: OrganizerReputation): ReputationScoreDto {
    return {
      organizerId: rep.organizerId,
      reputationScore: Number(rep.reputationScore),
      averageRating: Number(rep.averageRating),
      totalReviews: rep.totalReviews,
      ratingDistribution: rep.ratingDistribution,
      ratingStdDev: Number(rep.ratingStdDev),
      lastCalculatedAt: rep.lastCalculatedAt,
    };
  }
}
