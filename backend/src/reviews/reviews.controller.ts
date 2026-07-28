import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { PaginationDto } from '../common/pagination/dto/pagination.dto';
import { ReviewsService } from './reviews.service';
import { SubmitReviewDto } from './dto/submit-review.dto';
import {
  AttendanceVerificationResultDto,
  ReputationScoreDto,
  ReviewResponseDto,
} from './dto/review-response.dto';

@ApiTags('Reviews')
@ApiBearerAuth()
@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // ── submit_event_review ───────────────────────────────────────────────────

  @Post()
  @ApiOperation({
    summary: 'Submit an event review',
    description:
      'Submit a verified review for a completed event. ' +
      'The provided ticket must have status "used" (checked-in) to prevent fake reviews. ' +
      'One review per attendee per event is enforced.',
  })
  @ApiResponse({
    status: 201,
    description: 'Review submitted and attendance verified',
    type: ReviewResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request — ticket not used, event not completed, or invalid rating' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — ticket not owned by caller' })
  @ApiResponse({ status: 404, description: 'Ticket or event not found' })
  @ApiResponse({ status: 409, description: 'Review already submitted for this event' })
  submitReview(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SubmitReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.submitEventReview(req.user.id, dto);
  }

  // ── validate_reviewer_attendance ──────────────────────────────────────────

  @Post(':reviewId/verify')
  @ApiOperation({
    summary: 'Validate reviewer attendance',
    description:
      'Re-run the attendance verification check for a pending review. ' +
      'Confirms the linked ticket was checked in at the event. ' +
      'Idempotent — safe to call multiple times.',
  })
  @ApiParam({ name: 'reviewId', description: 'UUID of the review to verify' })
  @ApiResponse({
    status: 201,
    description: 'Verification result',
    type: AttendanceVerificationResultDto,
  })
  @ApiResponse({ status: 404, description: 'Review not found' })
  verifyAttendance(
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
  ): Promise<AttendanceVerificationResultDto> {
    return this.reviewsService.validateReviewerAttendance(reviewId);
  }

  // ── calculate_reputation_score ────────────────────────────────────────────

  @Get('reputation/:organizerId')
  @ApiOperation({
    summary: 'Get organizer reputation score',
    description:
      'Returns the weighted reputation score (0–100) for an event organizer, ' +
      'computed from all verified reviews. ' +
      'Score = quality (60 pts) + volume (20 pts) + consistency (20 pts).',
  })
  @ApiParam({ name: 'organizerId', description: 'UUID of the organizer' })
  @ApiResponse({
    status: 200,
    description: 'Reputation score and breakdown',
    type: ReputationScoreDto,
  })
  getReputation(
    @Param('organizerId', ParseUUIDPipe) organizerId: string,
  ): Promise<ReputationScoreDto> {
    return this.reviewsService.getOrganizerReputation(organizerId);
  }

  @Post('reputation/:organizerId/recalculate')
  @ApiOperation({
    summary: 'Recalculate organizer reputation score',
    description:
      'Trigger an on-demand recalculation of the reputation score for an organizer. ' +
      'Useful after bulk data corrections or admin overrides.',
  })
  @ApiParam({ name: 'organizerId', description: 'UUID of the organizer' })
  @ApiResponse({
    status: 201,
    description: 'Freshly calculated reputation score',
    type: ReputationScoreDto,
  })
  recalculateReputation(
    @Param('organizerId', ParseUUIDPipe) organizerId: string,
  ): Promise<ReputationScoreDto> {
    return this.reviewsService.calculateReputationScore(organizerId);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  @Get('event/:eventId')
  @ApiOperation({
    summary: 'Get reviews for an event',
    description: 'Returns paginated verified reviews for a specific event.',
  })
  @ApiParam({ name: 'eventId', description: 'UUID of the event' })
  @ApiResponse({ status: 200, description: 'Paginated list of verified reviews' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  getEventReviews(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() dto: PaginationDto,
  ) {
    return this.reviewsService.getEventReviews(eventId, dto);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get my reviews',
    description: 'Returns all reviews submitted by the current user.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of user reviews' })
  getMyReviews(
    @Req() req: AuthenticatedRequest,
    @Query() dto: PaginationDto,
  ) {
    return this.reviewsService.getMyReviews(req.user.id, dto);
  }

  @Get(':reviewId')
  @ApiOperation({
    summary: 'Get a review by ID',
    description: 'Returns a single review. Only the reviewer or the event organizer can access it.',
  })
  @ApiParam({ name: 'reviewId', description: 'UUID of the review' })
  @ApiResponse({ status: 200, description: 'Review found', type: ReviewResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  getReview(
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.getReviewById(reviewId, req.user.id);
  }
}
