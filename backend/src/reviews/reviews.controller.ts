import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'List published reviews with optional filters' })
  @ApiResponse({ status: 200, description: 'Paginated list of reviews.' })
  listReviews(@Query() dto: ListReviewsDto) {
    return this.reviewsService.listReviews(dto);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get rating summary for an event or venue' })
  @ApiQuery({ name: 'reviewableType', required: true })
  @ApiQuery({ name: 'reviewableId', required: true })
  @ApiResponse({ status: 200, description: 'Rating summary.' })
  getRatingSummary(
    @Query('reviewableType') reviewableType: string,
    @Query('reviewableId') reviewableId: string,
  ) {
    return this.reviewsService.getRatingSummary(reviewableType, reviewableId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a review by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Review details.' })
  @ApiResponse({ status: 404, description: 'Review not found.' })
  getReview(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviewsService.getReview(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Submit a review for an event or venue' })
  @ApiResponse({ status: 201, description: 'Review created.' })
  @ApiResponse({ status: 409, description: 'Duplicate review for this resource.' })
  createReview(@Body() dto: CreateReviewDto, @Req() req: AuthenticatedRequest) {
    return this.reviewsService.createReview(dto, req.user.id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a review (own review, or admin)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Review deleted.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  deleteReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user.role === Role.ADMIN;
    return this.reviewsService.deleteReview(id, req.user.id, isAdmin);
  }
}
