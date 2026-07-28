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

import { GamificationService } from './gamification.service';
import { AwardAchievementDto } from './dto/award-achievement.dto';
import { CreateAchievementDto } from './dto/create-achievement.dto';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { RecordActivityDto } from './dto/record-activity.dto';
import { LeaderboardPeriod } from './entities/leaderboard-entry.entity';

@ApiTags('Gamification')
@ApiBearerAuth()
@Controller('gamification')
@UseGuards(JwtAuthGuard)
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  // ── Profile ───────────────────────────────────────────────────────────────

  @Get('profile')
  @ApiOperation({ summary: 'Get my gamification profile', description: 'Returns XP, level, counters, and leaderboard rank for the current user.' })
  @ApiResponse({ status: 200, description: 'Gamification profile' })
  getMyProfile(@Req() req: AuthenticatedRequest) {
    return this.gamificationService.getProfile(req.user.id);
  }

  @Get('profile/:userId')
  @ApiOperation({ summary: 'Get a user\'s gamification profile (public)' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Gamification profile' })
  getProfile(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.gamificationService.getProfile(userId);
  }

  // ── Achievements ──────────────────────────────────────────────────────────

  @Get('achievements')
  @ApiOperation({ summary: 'List all available achievements' })
  @ApiResponse({ status: 200, description: 'Achievement catalogue' })
  getAllAchievements() {
    return this.gamificationService.getAllAchievements();
  }

  @Get('achievements/mine')
  @ApiOperation({ summary: 'Get my earned achievements' })
  @ApiResponse({ status: 200, description: 'User achievement list' })
  getMyAchievements(@Req() req: AuthenticatedRequest) {
    return this.gamificationService.getUserAchievements(req.user.id);
  }

  @Get('achievements/user/:userId')
  @ApiOperation({ summary: 'Get achievements earned by a specific user' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User achievement list' })
  getUserAchievements(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.gamificationService.getUserAchievements(userId);
  }

  @Post('achievements')
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({
    summary: 'Create a new achievement (admin)',
    description: 'Admin-only. Defines a new achievement badge in the catalogue.',
  })
  @ApiResponse({ status: 201, description: 'Achievement created' })
  @ApiResponse({ status: 409, description: 'Key already exists' })
  createAchievement(
    @Body() dto: CreateAchievementDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.gamificationService.createAchievement(dto, req.user.id);
  }

  // ── award_achievement ─────────────────────────────────────────────────────

  @Post('achievements/award')
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({
    summary: 'Award an achievement to a user (admin)',
    description:
      'Admin-only. Manually awards an achievement badge. ' +
      'Adds XP to the user\'s profile, recalculates level, and checks for milestone unlocks. ' +
      'Blocked for non-repeatable achievements already held by the user.',
  })
  @ApiResponse({ status: 201, description: 'Achievement awarded' })
  @ApiResponse({ status: 400, description: 'Achievement is inactive' })
  @ApiResponse({ status: 404, description: 'Achievement or user not found' })
  @ApiResponse({ status: 409, description: 'User already holds this achievement' })
  awardAchievement(@Body() dto: AwardAchievementDto) {
    return this.gamificationService.awardAchievement(dto);
  }

  // ── Activity recording ────────────────────────────────────────────────────

  @Post('activity')
  @ApiOperation({
    summary: 'Record a user activity',
    description:
      'Records an activity (ticket purchase, review, share, etc.) for the current user. ' +
      'Awards XP, checks for achievement unlocks, and advances challenge progress.',
  })
  @ApiResponse({ status: 201, description: 'Activity recorded, XP and achievements returned' })
  recordActivity(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RecordActivityDto,
  ) {
    return this.gamificationService.recordActivity(req.user.id, dto);
  }

  // ── update_leaderboard ────────────────────────────────────────────────────

  @Post('leaderboard/update')
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({
    summary: 'Rebuild the leaderboard (admin)',
    description:
      'Admin-only. Recomputes the leaderboard for the given period by ranking all users ' +
      'by total XP, counting achievements, and persisting a fresh snapshot. ' +
      'Also runs automatically every hour via a scheduled job.',
  })
  @ApiQuery({ name: 'period', enum: LeaderboardPeriod, required: false })
  @ApiQuery({ name: 'topN', required: false, description: 'Max entries (default 100)' })
  @ApiResponse({ status: 201, description: 'Leaderboard updated' })
  updateLeaderboard(
    @Query('period') period?: LeaderboardPeriod,
    @Query('topN') topN?: string,
  ) {
    return this.gamificationService.updateLeaderboard(
      period ?? LeaderboardPeriod.ALL_TIME,
      topN ? parseInt(topN, 10) : 100,
    );
  }

  @Get('leaderboard')
  @ApiOperation({
    summary: 'Get the leaderboard',
    description: 'Returns the current leaderboard snapshot for the requested period.',
  })
  @ApiQuery({ name: 'period', enum: LeaderboardPeriod, required: false })
  @ApiQuery({ name: 'limit', required: false, description: 'Max entries (default 50)' })
  @ApiResponse({ status: 200, description: 'Leaderboard entries' })
  getLeaderboard(
    @Query('period') period?: LeaderboardPeriod,
    @Query('limit') limit?: string,
  ) {
    return this.gamificationService.getLeaderboard(
      period ?? LeaderboardPeriod.ALL_TIME,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  // ── create_challenge ──────────────────────────────────────────────────────

  @Post('challenges')
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({
    summary: 'Create a challenge (admin)',
    description:
      'Admin-only. Creates a new time-boxed challenge. ' +
      'Challenges start in DRAFT status — call /activate to make them live. ' +
      'Supports individual and community challenge types.',
  })
  @ApiResponse({ status: 201, description: 'Challenge created' })
  @ApiResponse({ status: 400, description: 'Invalid date range or missing reward achievement' })
  createChallenge(
    @Body() dto: CreateChallengeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.gamificationService.createChallenge(dto, req.user.id);
  }

  @Put('challenges/:id/activate')
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Activate a draft challenge (admin)' })
  @ApiParam({ name: 'id', description: 'Challenge UUID' })
  @ApiResponse({ status: 200, description: 'Challenge activated' })
  activateChallenge(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.gamificationService.activateChallenge(id, req.user.id);
  }

  @Get('challenges')
  @ApiOperation({ summary: 'List active challenges' })
  @ApiResponse({ status: 200, description: 'Active challenges' })
  getActiveChallenges() {
    return this.gamificationService.getActiveChallenges();
  }

  @Get('challenges/:id')
  @ApiOperation({ summary: 'Get a challenge by ID' })
  @ApiParam({ name: 'id', description: 'Challenge UUID' })
  @ApiResponse({ status: 200, description: 'Challenge detail' })
  getChallenge(@Param('id', ParseUUIDPipe) id: string) {
    return this.gamificationService.getChallenge(id);
  }

  @Post('challenges/:id/join')
  @ApiOperation({
    summary: 'Join a challenge',
    description: 'Enrols the current user in an active challenge.',
  })
  @ApiParam({ name: 'id', description: 'Challenge UUID' })
  @ApiResponse({ status: 201, description: 'Joined challenge' })
  @ApiResponse({ status: 400, description: 'Challenge not active or full' })
  @ApiResponse({ status: 409, description: 'Already participating' })
  joinChallenge(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.gamificationService.joinChallenge(id, req.user.id);
  }

  @Get('challenges/mine')
  @ApiOperation({ summary: 'Get my challenge participations' })
  @ApiResponse({ status: 200, description: 'My challenge participations' })
  getMyChallenges(@Req() req: AuthenticatedRequest) {
    return this.gamificationService.getMyChallenges(req.user.id);
  }
}
