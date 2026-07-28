import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { RecommendationsService } from './recommendations.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { RecommendationResponseDto } from './dto/recommendation-response.dto';

@ApiTags('Recommendations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recommendations')
@ApiResponse({ status: 429, description: 'Too Many Requests' })
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Generate event recommendations',
    description:
      'Authenticated. Analyzes user history and preferences to recommend events using collaborative filtering.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 10,
    description: 'Maximum number of recommendations',
  })
  @ApiResponse({
    status: 200,
    description: 'Recommendations generated',
    type: RecommendationResponseDto,
  })
  async getRecommendations(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ): Promise<RecommendationResponseDto> {
    return this.recommendationsService.generateRecommendations(
      req.user.id,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Put('preferences')
  @ApiOperation({
    summary: 'Update user preferences',
    description:
      'Authenticated. Sets or updates user preference profile for better recommendations.',
  })
  @ApiResponse({ status: 200, description: 'Preferences updated' })
  async updatePreferences(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.recommendationsService.updateUserPreferences(
      req.user.id,
      dto,
    );
  }

  @Post('track-similarity')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Track event similarities (admin)',
    description:
      'Admin-only. Computes and stores similarity scores between all published events.',
  })
  @ApiResponse({ status: 201, description: 'Similarities tracked' })
  async trackSimilarity() {
    return this.recommendationsService.trackEventSimilarity();
  }

  @Get('events/:eventId/similar')
  @ApiOperation({
    summary: 'Get similar events',
    description:
      'Authenticated. Returns events similar to the specified event based on attributes and past data.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 5,
    description: 'Maximum number of similar events',
  })
  @ApiResponse({ status: 200, description: 'Similar events returned' })
  async getSimilarEvents(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query('limit') limit?: string,
  ) {
    return this.recommendationsService.getSimilarEvents(
      eventId,
      limit ? parseInt(limit, 10) : 5,
    );
  }
}
