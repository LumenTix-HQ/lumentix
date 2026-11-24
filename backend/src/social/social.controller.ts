import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { SocialService } from './social.service';
import { EnableSocialFeaturesDto } from './dto/enable-social-features.dto';
import { ConnectAttendeesDto } from './dto/connect-attendees.dto';
import { CreateMeetupGroupDto } from './dto/create-meetup-group.dto';
import { GenerateReferralLinkDto } from './dto/generate-referral-link.dto';
import { TrackReferralConversionDto } from './dto/track-referral-conversion.dto';
import { IssueReferralRewardDto } from './dto/issue-referral-reward.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Social')
@ApiBearerAuth()
@Controller('social')
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  // ── Social Profile ─────────────────────────────────────────────────────────

  @Post('profile')
  @ApiOperation({
    summary: 'Enable / update social features',
    description:
      'Opt into social networking. Creates a profile if one does not exist, or updates the existing one. All fields are optional.',
  })
  @ApiResponse({ status: 201, description: 'Social profile created or updated' })
  enableSocialFeatures(
    @Req() req: AuthenticatedRequest,
    @Body() dto: EnableSocialFeaturesDto,
  ) {
    return this.socialService.enableSocialFeatures(req.user.id, dto);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get my social profile' })
  @ApiResponse({ status: 200, description: 'Social profile returned' })
  getMyProfile(@Req() req: AuthenticatedRequest) {
    return this.socialService.getMyProfile(req.user.id);
  }

  @Delete('profile')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Disable social features',
    description: 'Sets profile to private and hides from all attendee lists.',
  })
  @ApiResponse({ status: 204, description: 'Social features disabled' })
  disableSocialFeatures(@Req() req: AuthenticatedRequest) {
    return this.socialService.disableSocialFeatures(req.user.id);
  }

  // ── Attendee List ──────────────────────────────────────────────────────────

  @Get('events/:eventId/attendees')
  @ApiOperation({
    summary: 'Get opt-in attendee list for an event',
    description:
      'Returns attendees who have enabled social features and opted into the attendee list. Respects visibility settings.',
  })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiQuery({
    name: 'userIds',
    required: true,
    description: 'Comma-separated list of registered user IDs',
  })
  @ApiResponse({ status: 200, description: 'Attendee list returned' })
  getEventAttendeeList(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query('userIds') userIds: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const registeredUserIds = userIds
      ? userIds.split(',').map((id) => id.trim()).filter(Boolean)
      : [];
    return this.socialService.getEventAttendeeList(
      eventId,
      req.user.id,
      registeredUserIds,
    );
  }

  // ── Connections ────────────────────────────────────────────────────────────

  @Post('connections')
  @ApiOperation({
    summary: 'Send a connection request to another attendee',
    description:
      'Both users must have social features enabled. The recipient must accept connection requests.',
  })
  @ApiResponse({ status: 201, description: 'Connection request sent' })
  @ApiResponse({ status: 400, description: 'Social features not enabled' })
  @ApiResponse({ status: 403, description: 'Recipient not accepting requests' })
  @ApiResponse({ status: 409, description: 'Already connected or request pending' })
  connectAttendees(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ConnectAttendeesDto,
  ) {
    return this.socialService.connectAttendees(req.user.id, dto);
  }

  @Get('connections')
  @ApiOperation({ summary: 'Get my accepted connections' })
  @ApiResponse({ status: 200, description: 'Connections list returned' })
  getMyConnections(@Req() req: AuthenticatedRequest) {
    return this.socialService.getMyConnections(req.user.id);
  }

  @Get('connections/pending')
  @ApiOperation({ summary: 'Get pending incoming connection requests' })
  @ApiResponse({ status: 200, description: 'Pending requests returned' })
  getPendingRequests(@Req() req: AuthenticatedRequest) {
    return this.socialService.getPendingRequests(req.user.id);
  }

  @Patch('connections/:id/accept')
  @ApiOperation({ summary: 'Accept a connection request' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Connection accepted' })
  acceptConnection(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.socialService.respondToConnection(id, req.user.id, true);
  }

  @Patch('connections/:id/decline')
  @ApiOperation({ summary: 'Decline a connection request' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Connection declined' })
  declineConnection(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.socialService.respondToConnection(id, req.user.id, false);
  }

  @Post('connections/block')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Block a user from sending connection requests' })
  @ApiResponse({ status: 204, description: 'User blocked' })
  blockUser(
    @Req() req: AuthenticatedRequest,
    @Body() body: { targetUserId: string },
  ) {
    return this.socialService.blockUser(req.user.id, body.targetUserId);
  }

  // ── Meetup Groups ──────────────────────────────────────────────────────────

  @Post('meetup-groups')
  @ApiOperation({
    summary: 'Create a meetup group for an event',
    description:
      'Allows attendees to coordinate in-person meetups during events. Creator must have social features enabled.',
  })
  @ApiResponse({ status: 201, description: 'Meetup group created' })
  createMeetupGroup(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateMeetupGroupDto,
  ) {
    return this.socialService.createMeetupGroup(req.user.id, dto);
  }

  @Get('events/:eventId/meetup-groups')
  @ApiOperation({ summary: 'List open meetup groups for an event' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Meetup groups returned' })
  listMeetupGroups(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.socialService.listMeetupGroupsForEvent(eventId);
  }

  @Post('meetup-groups/:id/join')
  @ApiOperation({ summary: 'Join a meetup group' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Joined meetup group' })
  joinMeetupGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.socialService.joinMeetupGroup(id, req.user.id);
  }

  @Delete('meetup-groups/:id/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Leave a meetup group' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Left meetup group' })
  leaveMeetupGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.socialService.leaveMeetupGroup(id, req.user.id);
  }

  @Patch('meetup-groups/:id/close')
  @ApiOperation({ summary: 'Close a meetup group (creator only)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Meetup group closed' })
  closeMeetupGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.socialService.closeMeetupGroup(id, req.user.id);
  }

  @Get('meetup-groups/:id/members')
  @ApiOperation({ summary: 'Get members of a meetup group' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Members returned' })
  getMeetupGroupMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.socialService.getMeetupGroupMembers(id);
  }

  // ── Social Sharing Referral Incentive Program (#1536) ─────────────────────

  @Post('referral/generate')
  @ApiOperation({
    summary: 'Generate referral link',
    description:
      'Generate a unique social media referral link with embedded tracking code to earn loyalty points or discount codes when friends purchase tickets.',
  })
  @ApiResponse({ status: 201, description: 'Referral link generated successfully' })
  generateReferralLink(
    @Req() req: AuthenticatedRequest,
    @Body() dto: GenerateReferralLinkDto,
  ) {
    return this.socialService.generate_referral_link(req.user.id, dto);
  }

  @Post('referral/convert')
  @ApiOperation({
    summary: 'Track referral conversion',
    description:
      'Track when a referred friend purchases a ticket and qualify the referrer for loyalty rewards.',
  })
  @ApiResponse({ status: 200, description: 'Referral conversion tracked and reward triggered' })
  trackReferralConversion(
    @Req() req: AuthenticatedRequest,
    @Body() dto: TrackReferralConversionDto,
  ) {
    return this.socialService.track_referral_conversion(req.user.id, dto);
  }

  @Post('referral/reward/:id')
  @ApiOperation({
    summary: 'Issue referral reward',
    description:
      'Manually or programmatically issue loyalty points or discount codes for a converted referral.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Referral ID' })
  @ApiResponse({ status: 200, description: 'Reward issued successfully' })
  issueReferralReward(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto?: IssueReferralRewardDto,
  ) {
    return this.socialService.issue_referral_reward(id, dto?.rewardType);
  }

  @Get('referral/my-referrals')
  @ApiOperation({ summary: 'Get my generated referral links' })
  @ApiResponse({ status: 200, description: 'List of user referrals' })
  getMyReferrals(@Req() req: AuthenticatedRequest) {
    return this.socialService.getMyReferrals(req.user.id);
  }

  @Get('referral/stats')
  @ApiOperation({ summary: 'Get summary statistics of referrals and earned rewards' })
  @ApiResponse({ status: 200, description: 'Referral statistics' })
  getReferralStats(@Req() req: AuthenticatedRequest) {
    return this.socialService.getReferralStats(req.user.id);
  }

  @Get('referral/validate/:code')
  @ApiOperation({ summary: 'Validate a referral code' })
  @ApiParam({ name: 'code', description: 'Referral code (e.g. REF-ABC123)' })
  @ApiResponse({ status: 200, description: 'Referral details' })
  validateReferralCode(@Param('code') code: string) {
    return this.socialService.getReferralByCode(code);
  }
}
