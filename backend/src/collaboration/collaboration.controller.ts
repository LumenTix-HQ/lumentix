import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { CollaborationService } from './collaboration.service';
import { CreateOrganizerTeamDto } from './dto/create-organizer-team.dto';
import { CreateTaskDto, UpdateTaskDto } from './dto/manage-team-tasks.dto';
import { SendMessageDto, UpdateMessageDto, AddReactionDto } from './dto/facilitate-team-communication.dto';
import { UploadResourceDto } from './dto/upload-resource.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Event Collaboration')
@ApiBearerAuth()
@Controller('collaboration')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CollaborationController {
  constructor(private readonly collaborationService: CollaborationService) {}

  @Post('teams')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Create an organizer team' })
  @ApiResponse({ status: 201, description: 'Team created' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  createTeam(@Body() dto: CreateOrganizerTeamDto, @Req() req: AuthenticatedRequest) {
    return this.collaborationService.createOrganizerTeam(dto, req.user.id);
  }

  @Post('teams/:teamId/tasks')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Create a team task' })
  @ApiParam({ name: 'teamId', description: 'Team UUID' })
  @ApiResponse({ status: 201, description: 'Task created' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  createTask(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: CreateTaskDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collaborationService.manageTeamTasks(teamId, 'create', dto, undefined, req.user.id);
  }

  @Put('teams/:teamId/tasks/:taskId')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Update a team task' })
  @ApiParam({ name: 'teamId', description: 'Team UUID' })
  @ApiParam({ name: 'taskId', description: 'Task UUID' })
  @ApiResponse({ status: 200, description: 'Task updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  updateTask(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collaborationService.manageTeamTasks(teamId, 'update', dto, taskId, req.user.id);
  }

  @Delete('teams/:teamId/tasks/:taskId')
  @Roles(Role.ORGANIZER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a team task' })
  @ApiParam({ name: 'teamId', description: 'Team UUID' })
  @ApiParam({ name: 'taskId', description: 'Task UUID' })
  @ApiResponse({ status: 204, description: 'Task deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  deleteTask(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collaborationService.manageTeamTasks(teamId, 'delete', undefined, taskId, req.user.id);
  }

  @Get('teams/:teamId/tasks')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'List team tasks' })
  @ApiParam({ name: 'teamId', description: 'Team UUID' })
  @ApiResponse({ status: 200, description: 'Tasks retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  listTasks(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collaborationService.manageTeamTasks(teamId, 'list', undefined, undefined, req.user.id);
  }

  @Post('teams/:teamId/messages')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Send a team message' })
  @ApiParam({ name: 'teamId', description: 'Team UUID' })
  @ApiResponse({ status: 201, description: 'Message sent' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  sendMessage(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: SendMessageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collaborationService.facilitateTeamCommunication(teamId, 'send', dto, undefined, req.user.id);
  }

  @Put('teams/:teamId/messages/:messageId')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Update a team message' })
  @ApiParam({ name: 'teamId', description: 'Team UUID' })
  @ApiParam({ name: 'messageId', description: 'Message UUID' })
  @ApiResponse({ status: 200, description: 'Message updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  updateMessage(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: UpdateMessageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collaborationService.facilitateTeamCommunication(teamId, 'update', dto, messageId, req.user.id);
  }

  @Delete('teams/:teamId/messages/:messageId')
  @Roles(Role.ORGANIZER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a team message' })
  @ApiParam({ name: 'teamId', description: 'Team UUID' })
  @ApiParam({ name: 'messageId', description: 'Message UUID' })
  @ApiResponse({ status: 204, description: 'Message deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  deleteMessage(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collaborationService.facilitateTeamCommunication(teamId, 'delete', undefined, messageId, req.user.id);
  }

  @Post('teams/:teamId/messages/:messageId/react')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Add/remove reaction to a message' })
  @ApiParam({ name: 'teamId', description: 'Team UUID' })
  @ApiParam({ name: 'messageId', description: 'Message UUID' })
  @ApiResponse({ status: 200, description: 'Reaction updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  reactToMessage(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: AddReactionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collaborationService.facilitateTeamCommunication(teamId, 'react', dto, messageId, req.user.id);
  }

  @Get('teams/:teamId/messages')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'List team messages' })
  @ApiParam({ name: 'teamId', description: 'Team UUID' })
  @ApiResponse({ status: 200, description: 'Messages retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  listMessages(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collaborationService.facilitateTeamCommunication(teamId, 'list', undefined, undefined, req.user.id);
  }

  @Post('teams/:teamId/resources')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Upload a team resource' })
  @ApiParam({ name: 'teamId', description: 'Team UUID' })
  @ApiResponse({ status: 201, description: 'Resource uploaded' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  uploadResource(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: UploadResourceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collaborationService.uploadResource({ ...dto, teamId }, req.user.id);
  }

  @Get('teams/:teamId/resources')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'List team resources' })
  @ApiParam({ name: 'teamId', description: 'Team UUID' })
  @ApiResponse({ status: 200, description: 'Resources retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  listResources(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collaborationService.getTeamResources(teamId, req.user.id);
  }

  @Get('teams/:teamId/members')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'List team members' })
  @ApiParam({ name: 'teamId', description: 'Team UUID' })
  @ApiResponse({ status: 200, description: 'Members retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  listMembers(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collaborationService.getTeamMembers(teamId, req.user.id);
  }

  @Post('teams/:teamId/members/:userId')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Add a member to the team' })
  @ApiParam({ name: 'teamId', description: 'Team UUID' })
  @ApiParam({ name: 'userId', description: 'User UUID to add' })
  @ApiResponse({ status: 201, description: 'Member added' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  addMember(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collaborationService.addTeamMember(teamId, userId, req.user.id);
  }

  @Delete('teams/:teamId/members/:userId')
  @Roles(Role.ORGANIZER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from the team' })
  @ApiParam({ name: 'teamId', description: 'Team UUID' })
  @ApiParam({ name: 'userId', description: 'User UUID to remove' })
  @ApiResponse({ status: 204, description: 'Member removed' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  removeMember(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collaborationService.removeTeamMember(teamId, userId, req.user.id);
  }
}
