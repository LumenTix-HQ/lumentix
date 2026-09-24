import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { RecommendationsService } from './recommendations.service';
import {
  RecommendationResponse,
  UpdateUserPreferencesResultDto,
} from './dto/recommendation-response.dto';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';

@ApiTags('recommendations')
@ApiBearerAuth()
@Controller('recommendations')
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  /**
   * Ranked, personalized event suggestions for a given user (#1243).
   * Mirrors the `/recommendations` route documented in API_REFERENCE.
   */
  @Get(':userId')
  @ApiOperation({
    summary: 'Get personalized event recommendations for a user',
  })
  @ApiParam({ name: 'userId', type: 'string' })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
  })
  @ApiResponse({
    status: 200,
    description: 'Ranked recommendations computed from the user profile vector.',
    type: RecommendationResponse,
  })
  getRecommendations(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('limit') limit?: number,
  ): Promise<RecommendationResponse> {
    return this.recommendationsService.rank_recommendations(
      userId,
      limit ? Math.min(20, Math.max(1, Number(limit))) : 5,
    );
  }

  /**
   * Replace the user's implicit preference vector (category/location
   * weightings) that the engine ranks against (#1243).
   */
  @Put(':userId/preferences')
  @ApiOperation({ summary: 'Update a user’s preference profile' })
  @ApiParam({ name: 'userId', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Preferences replaced; counts how many rows were saved.',
    type: UpdateUserPreferencesResultDto,
  })
  updatePreferences(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserPreferencesDto,
  ): Promise<UpdateUserPreferencesResultDto> {
    return this.recommendationsService.update_user_preferences(userId, dto);
  }
}
