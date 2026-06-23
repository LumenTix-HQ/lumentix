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
import { BruteForceService } from '../common/services/brute-force.service';
import { ListAdminEventsDto } from './dto/list-admin-events.dto';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { AdminService } from './admin.service';
import { PaginationDto } from '../common/pagination/dto/pagination.dto';
import { RoleRequestStatus } from '../users/entities/role-request.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { StellarService } from '../stellar/stellar.service';
import { StellarWebhookService } from '../stellar/stellar-webhook.service';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly bruteForceService: BruteForceService,
    private readonly stellarService: StellarService,
    private readonly stellarWebhookService: StellarWebhookService,
  ) {}

  // ─── Stellar Stream Management ────────────────────────────────────────────

  @Post('stellar/reconnect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manually reconnect the Stellar payment stream',
    description:
      'Admin-only endpoint. Restarts the Horizon SSE stream and resets the ' +
      'consecutive-failure counter. Use after a STELLAR_STREAM_DEAD event.',
  })
  @ApiResponse({ status: 200, description: 'Stream reconnect initiated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  reconnectStellarStream(): { message: string } {
    this.stellarWebhookService.reconnect();
    return { message: 'Stellar stream reconnect initiated' };
  }

  @Patch('security/unlock-ip/:ip')
  @ApiOperation({ summary: 'Unlock an IP address' })
  @ApiParam({ name: 'ip', description: 'Locked IP address' })
  @ApiResponse({ status: 200, description: 'IP unlocked successfully' })
  unlockIp(@Param('ip') ip: string) {
    return this.bruteForceService.unlock(ip);
  }

  @Patch('events/:id/approve')
  @ApiOperation({ summary: 'Approve an event' })
  @ApiResponse({ status: 200, description: 'Event approved successfully' })
  approveEvent(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.approveEvent(id);
  }

  @Patch('events/:id/suspend')
  @ApiOperation({ summary: 'Suspend an event' })
  @ApiResponse({ status: 200, description: 'Event suspended successfully' })
  suspendEvent(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.suspendEvent(id);
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'List platform users' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  listUsers(@Query() dto: ListAdminUsersDto) {
    return this.adminService.listUsers(dto);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get user details' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUserById(id);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update user (role, settings)' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.adminService.updateUser(id, dto);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a user' })
  @ApiResponse({ status: 204, description: 'User soft-deleted' })
  softDeleteUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.softDeleteUser(id);
  }

  @Patch('users/:id/unblock')
  @ApiOperation({ summary: 'Unblock a user' })
  @ApiResponse({ status: 200, description: 'User unblocked successfully' })
  unblockUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.unblockUser(id);
  }

  @Patch('users/:id/block')
  @ApiOperation({ summary: 'Block a user' })
  @ApiResponse({ status: 200, description: 'User blocked successfully' })
  blockUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.blockUser(id);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  @Get('events')
  @ApiOperation({ summary: 'List all events' })
  @ApiResponse({ status: 200, description: 'Events retrieved successfully' })
  listAllEvents(@Query() dto: ListAdminEventsDto) {
    return this.adminService.listAllEvents(dto);
  }

  // ── Role Requests ─────────────────────────────────────────────────────────

  @Get('role-requests')
  @ApiOperation({ summary: 'List role upgrade requests' })
  listRoleRequests(
    @Query() paginationDto: PaginationDto,
    @Query('status') status?: RoleRequestStatus,
  ) {
    return this.adminService.listRoleRequests({ ...paginationDto, status });
  }

  @Patch('role-requests/:id/approve')
  @ApiOperation({ summary: 'Approve role request' })
  approveRoleRequest(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.approveRoleRequest(id);
  }

  @Patch('role-requests/:id/reject')
  @ApiOperation({ summary: 'Reject role request' })
  rejectRoleRequest(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.rejectRoleRequest(id);
  }

  // ── Stellar ───────────────────────────────────────────────────────────────

  @Get('stellar/platform-balance')
  @ApiOperation({ summary: 'Get platform Stellar account balance' })
  getPlatformBalance() {
    return this.stellarService.getPlatformBalanceInfo();
  }
}
