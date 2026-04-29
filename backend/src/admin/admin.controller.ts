import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { AdminService } from './admin.service';
import { PaginationDto } from '../common/pagination/dto/pagination.dto';
import { RoleRequestStatus } from '../users/entities/role-request.entity';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly bruteForceService: BruteForceService,
  ) {}

  @Patch('security/unlock-ip/:ip')
  @ApiOperation({
    summary: 'Unlock an IP address',
    description:
      'Authenticated admin endpoint. Removes a brute-force lockout for the specified IP address.',
  })
  @ApiParam({ name: 'ip', description: 'Locked IP address' })
  @ApiResponse({ status: 200, description: 'IP unlocked successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  unlockIp(@Param('ip') ip: string) {
    return this.bruteForceService.unlock(ip);
  }

  @Patch('events/:id/approve')
  @ApiOperation({
    summary: 'Approve an event',
    description:
      'Authenticated admin endpoint. Publishes an event that is ready for approval.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Event approved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  approveEvent(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.approveEvent(id);
  }

  @Patch('events/:id/suspend')
  @ApiOperation({
    summary: 'Suspend an event',
    description:
      'Authenticated admin endpoint. Suspends an event, preventing further registrations or payments.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Event suspended successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  suspendEvent(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.suspendEvent(id);
  }

  @Get('users')
  @ApiOperation({
    summary: 'List platform users',
    description:
      'Authenticated admin endpoint. Returns a paginated list of platform users.',
  })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  listUsers(@Query() dto: ListAdminUsersDto) {
    return this.adminService.listUsers(dto);
  }

  @Get('users/:id')
  @ApiOperation({
    summary: 'Get user details',
    description:
      'Authenticated admin endpoint. Returns full details for a single user.',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUserById(id);
  }

  @Patch('users/:id/unblock')
  @ApiOperation({
    summary: 'Unblock a user',
    description:
      'Authenticated admin endpoint. Removes the blocked status from a user account.',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User unblocked successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'User not found' })
  unblockUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.unblockUser(id);
  }

  @Patch('users/:id/block')
  @ApiOperation({
    summary: 'Block a user',
    description:
      'Authenticated admin endpoint. Blocks a user from accessing the platform.',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User blocked successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'User not found' })
  blockUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.blockUser(id);
  }

  @Get('events')
  @ApiOperation({
    summary: 'List all events',
    description:
      'Authenticated admin endpoint. Returns a paginated list of all events across the platform.',
  })
  @ApiResponse({ status: 200, description: 'Events retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  listAllEvents(@Query() dto: ListAdminEventsDto) {
    return this.adminService.listAllEvents(dto);
  }

  @Get('role-requests')
  @ApiOperation({
    summary: 'List role upgrade requests',
    description:
      'Authenticated admin endpoint. Returns paginated role upgrade requests with an optional status filter.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'approved', 'rejected'],
    description: 'Optional role request status filter',
  })
  @ApiResponse({ status: 200, description: 'Role requests retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  listRoleRequests(
    @Query() paginationDto: PaginationDto,
    @Query('status') status?: RoleRequestStatus,
  ) {
    return this.adminService.listRoleRequests({ ...paginationDto, status });
  }

  @Patch('role-requests/:id/approve')
  @ApiOperation({
    summary: 'Approve role request',
    description:
      'Authenticated admin endpoint. Approves a pending role upgrade request.',
  })
  @ApiParam({ name: 'id', description: 'Role request UUID' })
  @ApiResponse({ status: 200, description: 'Role request approved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Role request not found' })
  approveRoleRequest(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.approveRoleRequest(id);
  }

  @Patch('role-requests/:id/reject')
  @ApiOperation({
    summary: 'Reject role request',
    description:
      'Authenticated admin endpoint. Rejects a pending role upgrade request.',
  })
  @ApiParam({ name: 'id', description: 'Role request UUID' })
  @ApiResponse({ status: 200, description: 'Role request rejected successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Role request not found' })
  rejectRoleRequest(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.rejectRoleRequest(id);
  }
}
