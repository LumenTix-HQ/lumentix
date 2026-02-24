import {
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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

  @Patch('users/:id/block')
  @ApiOperation({ summary: 'Block a user from the platform' })
  blockUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.blockUser(id);
  }
}
