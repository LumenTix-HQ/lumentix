import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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

import { RecommendationsService } from './recommendations.service';
import { RecommendationResponse } from './dto/recommendation-response.dto';
import {
  UpdateUserPreferencesDto,
  UpdateUserPreferencesResultDto,
} from './dto/update-user-preferences.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

function normalizeLimit(limit?: string): number {
  return limit ? Math.min(20, Math.max(1, Number(limit))) : 5;
}

@ApiTags('recommendations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('recommendations')
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  /**
   * Ranked, personalized event suggestions for the authenticated caller
   * (#1243). Mirrors the `/recommendations` route documented in
   * API_REFERENCE.
   */
  @Get('me')
  @ApiOperation({
    summary: 'Get personalized event recommendations for the current user',
  })
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
  getMyRecommendations(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ): Promise<RecommendationResponse> {
    return this.recommendationsService.generateRecommendations(
      req.user.id,
      normalizeLimit(limit),
    );
  }

  /**
   * Admin-only variant that computes recommendations for an arbitrary user.
   */
  @Get(':userId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get personalized event recommendations for a user (admin only)',
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
  getRecommendationsForUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('limit') limit?: string,
  ): Promise<RecommendationResponse> {
    return this.recommendationsService.generateRecommendations(
      userId,
      normalizeLimit(limit),
    );
  }

  /**
   * Replace the authenticated caller's implicit preference vector
   * (category/location weightings) that the engine ranks against (#1243).
   */
  @Put('me/preferences')
  @ApiOperation({ summary: 'Update the current user’s preference profile' })
  @ApiResponse({
    status: 200,
    description: 'Preferences replaced; counts how many rows were saved.',
    type: UpdateUserPreferencesResultDto,
  })
  updateMyPreferences(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateUserPreferencesDto,
  ): Promise<UpdateUserPreferencesResultDto> {
    return this.recommendationsService.updateUserPreferences(req.user.id, dto);
  }

  /**
   * Admin-only variant that replaces an arbitrary user's preference profile.
   */
  @Put(':userId/preferences')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a user’s preference profile (admin only)' })
  @ApiParam({ name: 'userId', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Preferences replaced; counts how many rows were saved.',
    type: UpdateUserPreferencesResultDto,
  })
  updatePreferencesForUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserPreferencesDto,
  ): Promise<UpdateUserPreferencesResultDto> {
    return this.recommendationsService.updateUserPreferences(userId, dto);
  }
}
