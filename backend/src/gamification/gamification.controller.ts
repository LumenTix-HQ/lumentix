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
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GamificationService } from './gamification.service';
import { CreateBadgeDto } from './dto/create-badge.dto';
import { LeaderboardPeriod } from './entities/leaderboard-entry.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

@ApiTags('Gamification')
@Controller('gamification')
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  // ── Badges ───────────────────────────────────────────────────────────────

  @Get('badges')
  @ApiOperation({ summary: 'List all badge definitions' })
  @ApiResponse({ status: 200, description: 'Array of badges.' })
  listBadges() {
    return this.gamificationService.listBadges();
  }

  @Get('badges/:id')
  @ApiOperation({ summary: 'Get a badge definition by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Badge details.' })
  @ApiResponse({ status: 404, description: 'Badge not found.' })
  getBadge(@Param('id', ParseUUIDPipe) id: string) {
    return this.gamificationService.getBadge(id);
  }

  @Post('badges')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Create a badge definition' })
  @ApiResponse({ status: 201, description: 'Badge created.' })
  createBadge(@Body() dto: CreateBadgeDto) {
    return this.gamificationService.createBadge(dto);
  }

  // ── User profile ─────────────────────────────────────────────────────────

  @Get('profile/me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get my gamification profile (XP, badges, rank)' })
  @ApiResponse({ status: 200, description: 'User gamification profile.' })
  getMyProfile(@Req() req: AuthenticatedRequest) {
    return this.gamificationService.getUserProfile(req.user.id);
  }

  @Get('profile/me/badges')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'List my earned badges' })
  @ApiResponse({ status: 200, description: 'Array of earned badges.' })
  getMyBadges(@Req() req: AuthenticatedRequest) {
    return this.gamificationService.getMyBadges(req.user.id);
  }

  @Get('profile/:userId')
  @ApiOperation({ summary: "Get any user's gamification profile" })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'User gamification profile.' })
  getUserProfile(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.gamificationService.getUserProfile(userId);
  }

  // ── Leaderboard ──────────────────────────────────────────────────────────

  @Get('leaderboard')
  @ApiOperation({ summary: 'Get leaderboard' })
  @ApiQuery({ name: 'period', enum: LeaderboardPeriod, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiResponse({ status: 200, description: 'Leaderboard page.' })
  getLeaderboard(
    @Query('period') period?: LeaderboardPeriod,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.gamificationService.getLeaderboard(
      period ?? LeaderboardPeriod.ALL_TIME,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }
}
