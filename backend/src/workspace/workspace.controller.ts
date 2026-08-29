import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WorkspaceService } from './workspace.service';
import { AddWorkspaceMemberDto } from './dto/add-workspace-member.dto';
import { SyncWorkspaceChangesDto } from './dto/sync-workspace-changes.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Workspace')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post('events/:eventId/workspace')
  @ApiOperation({
    summary: 'Create collaborative workspace',
    description: 'Organizer-only. Creates the shared editing workspace for an event.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 201, description: 'Workspace created' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workspaceService.createWorkspace(eventId, req.user.id);
  }

  @Get('workspace/:id')
  @ApiOperation({ summary: 'Get workspace', description: 'Member-only. Returns workspace state.' })
  @ApiParam({ name: 'id', description: 'Workspace UUID' })
  @ApiResponse({ status: 200, description: 'Workspace' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return this.workspaceService.getWorkspace(id, req.user.id);
  }

  @Post('workspace/:id/members')
  @ApiOperation({
    summary: 'Add workspace team member',
    description: 'Member-only. Adds another organizer team member to the workspace.',
  })
  @ApiParam({ name: 'id', description: 'Workspace UUID' })
  @ApiResponse({ status: 201, description: 'Member added' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddWorkspaceMemberDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workspaceService.addWorkspaceMember(id, dto.userId, req.user.id);
  }

  @Post('workspace/:id/sync')
  @ApiOperation({
    summary: 'Sync workspace changes',
    description:
      'Member-only. Applies a batch of edits/tasks/comments, resolving any version conflicts with last-write-wins.',
  })
  @ApiParam({ name: 'id', description: 'Workspace UUID' })
  @ApiResponse({ status: 201, description: 'Changes applied' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  sync(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SyncWorkspaceChangesDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workspaceService.syncWorkspaceChanges(id, req.user.id, dto.changes);
  }
}
