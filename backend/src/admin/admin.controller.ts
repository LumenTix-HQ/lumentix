import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { ApiOperation, ApiQuery, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BruteForceService } from '../common/services/brute-force.service';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';
import { ListAdminEventsDto } from './dto/list-admin-events.dto';
import { PaginationDto } from '../common/pagination/dto/pagination.dto';
import { RoleRequestStatus } from '../users/entities/role-request.entity';

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
  @ApiOperation({ summary: 'Unlock an IP from brute force lockout' })
  unlockIp(@Param('ip') ip: string) {
    return this.bruteForceService.unlock(ip);
  }

  @Patch('events/:id/approve')
  @ApiOperation({ summary: 'Approve a draft event (publish it)' })
  approveEvent(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.approveEvent(id);
  }

  @Patch('events/:id/suspend')
  @ApiOperation({ summary: 'Suspend an event (cancels it, blocks payments)' })
  suspendEvent(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.suspendEvent(id);
  }

  @Get('users')
  @ApiOperation({ summary: 'Get paginated users (admin only)' })
  listUsers(@Query() dto: ListAdminUsersDto) {
    return this.adminService.listUsers(dto);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get full user details by ID (admin only)' })
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUserById(id);
  }

  @Patch('users/:id/unblock')
  @ApiOperation({
    summary: 'Unblock a blocked user',
    description: 'Only works if currently blocked.',
  })
  unblockUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.unblockUser(id);
  }

  @Patch('users/:id/block')
  @ApiOperation({ summary: 'Block a user from the platform' })
  blockUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.blockUser(id);
  }

  @Get('events')
  @ApiOperation({ summary: 'Get all events (admin only)' })
  listAllEvents(@Query() dto: ListAdminEventsDto) {
    return this.adminService.listAllEvents(dto);
  }

  // ── Role Requests ─────────────────────────────────────────────────────────

  @Get('role-requests')
  @ApiOperation({ summary: 'List role upgrade requests' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'approved', 'rejected'] })
  listRoleRequests(
    @Query() paginationDto: PaginationDto,
    @Query('status') status?: RoleRequestStatus,
  ) {
    return this.adminService.listRoleRequests({ ...paginationDto, status });
  }

  @Patch('role-requests/:id/approve')
  @ApiOperation({ summary: 'Approve a role upgrade request' })
  approveRoleRequest(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.approveRoleRequest(id);
  }

  @Patch('role-requests/:id/reject')
  @ApiOperation({ summary: 'Reject a role upgrade request' })
  rejectRoleRequest(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.rejectRoleRequest(id);
  }
}
