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
  }
}
