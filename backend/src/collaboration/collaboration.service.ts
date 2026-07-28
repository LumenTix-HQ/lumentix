import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { OrganizerTeam } from './entities/organizer-team.entity';
import { TeamMember } from './entities/team-member.entity';
import { TeamTask } from './entities/team-task.entity';
import { TeamMessage } from './entities/team-message.entity';
import { TeamResource } from './entities/team-resource.entity';
import { CreateOrganizerTeamDto } from './dto/create-organizer-team.dto';
import { CreateTaskDto, UpdateTaskDto } from './dto/manage-team-tasks.dto';
import { SendMessageDto, UpdateMessageDto, AddReactionDto } from './dto/facilitate-team-communication.dto';
import { UploadResourceDto } from './dto/upload-resource.dto';
import { Event } from '../events/entities/event.entity';
import { EventsService } from '../events/events.service';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class CollaborationService {
  private readonly logger = new Logger(CollaborationService.name);

  constructor(
    @InjectRepository(OrganizerTeam)
    private readonly teamRepository: Repository<OrganizerTeam>,
    @InjectRepository(TeamMember)
    private readonly memberRepository: Repository<TeamMember>,
    @InjectRepository(TeamTask)
    private readonly taskRepository: Repository<TeamTask>,
    @InjectRepository(TeamMessage)
    private readonly messageRepository: Repository<TeamMessage>,
    @InjectRepository(TeamResource)
    private readonly resourceRepository: Repository<TeamResource>,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private readonly eventsService: EventsService,
    private readonly notificationService: NotificationService,
  ) {}

  async createOrganizerTeam(
    dto: CreateOrganizerTeamDto,
    organizerId: string,
  ): Promise<OrganizerTeam> {
    const event = await this.eventsService.getEventById(dto.eventId);
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('You are not the organizer of this event.');
    }

    const team = this.teamRepository.create({
      eventId: dto.eventId,
      teamName: dto.teamName,
      createdBy: organizerId,
      description: dto.description || null,
      settings: {
        allowGuestAccess: dto.settings?.allowGuestAccess || false,
        requireApproval: dto.settings?.requireApproval || false,
        maxMembers: dto.settings?.maxMembers || 50,
      },
    });

    const savedTeam = await this.teamRepository.save(team);

    const ownerMember = this.memberRepository.create({
      teamId: savedTeam.id,
      userId: organizerId,
      role: 'owner',
      permissions: ['all'],
      status: 'active',
    });
    await this.memberRepository.save(ownerMember);

    if (dto.memberIds && dto.memberIds.length > 0) {
      const members = dto.memberIds.map((userId) =>
        this.memberRepository.create({
          teamId: savedTeam.id,
          userId,
          role: 'member',
          permissions: ['read', 'write'],
          status: 'pending',
        }),
      );
      await this.memberRepository.save(members);
    }

    return savedTeam;
  }

  async manageTeamTasks(
    teamId: string,
    action: 'create' | 'update' | 'delete' | 'list',
    dto?: CreateTaskDto | UpdateTaskDto,
    taskId?: string,
    userId?: string,
  ): Promise<any> {
    const team = await this.teamRepository.findOne({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('Team not found.');
    }

    const member = await this.memberRepository.findOne({
      where: { teamId, userId, status: 'active' },
    });
    if (!member) {
      throw new ForbiddenException('You are not a member of this team.');
    }

    if (action === 'create') {
      const createDto = dto as CreateTaskDto;
      const task = this.taskRepository.create({
        teamId,
        title: createDto.title,
        description: createDto.description || null,
        status: createDto.status || 'todo',
        priority: createDto.priority || 'medium',
        assignedTo: createDto.assignedTo || null,
        dueDate: createDto.dueDate ? new Date(createDto.dueDate) : null,
        tags: createDto.tags || null,
        attachments: createDto.attachments || null,
        createdBy: userId,
        order: await this.getNextTaskOrder(teamId),
      });
      return this.taskRepository.save(task);
    }

    if (action === 'update' && taskId) {
      const task = await this.taskRepository.findOne({ where: { id: taskId, teamId } });
      if (!task) {
        throw new NotFoundException('Task not found.');
      }

      const updateDto = dto as UpdateTaskDto;
      Object.assign(task, {
        ...(updateDto.title !== undefined && { title: updateDto.title }),
        ...(updateDto.description !== undefined && { description: updateDto.description }),
        ...(updateDto.status !== undefined && { status: updateDto.status }),
        ...(updateDto.priority !== undefined && { priority: updateDto.priority }),
        ...(updateDto.assignedTo !== undefined && { assignedTo: updateDto.assignedTo }),
        ...(updateDto.dueDate !== undefined && { dueDate: updateDto.dueDate ? new Date(updateDto.dueDate) : null }),
        ...(updateDto.tags !== undefined && { tags: updateDto.tags }),
        ...(updateDto.attachments !== undefined && { attachments: updateDto.attachments }),
        ...(updateDto.order !== undefined && { order: updateDto.order }),
      });

      if (updateDto.status === 'completed' && !task.completedAt) {
        task.completedAt = new Date();
      }

      return this.taskRepository.save(task);
    }

    if (action === 'delete' && taskId) {
      const task = await this.taskRepository.findOne({ where: { id: taskId, teamId } });
      if (!task) {
        throw new NotFoundException('Task not found.');
      }
      await this.taskRepository.remove(task);
      return { success: true };
    }

    if (action === 'list') {
      return this.taskRepository.find({
        where: { teamId },
        order: { order: 'ASC', createdAt: 'DESC' },
        relations: ['assignee', 'creator'],
      });
    }

    throw new Error('Invalid action.');
  }

  async facilitateTeamCommunication(
    teamId: string,
    action: 'send' | 'update' | 'delete' | 'list' | 'react',
    dto?: SendMessageDto | UpdateMessageDto | AddReactionDto,
    messageId?: string,
    userId?: string,
  ): Promise<any> {
    const team = await this.teamRepository.findOne({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('Team not found.');
    }

    const member = await this.memberRepository.findOne({
      where: { teamId, userId, status: 'active' },
    });
    if (!member) {
      throw new ForbiddenException('You are not a member of this team.');
    }

    if (action === 'send') {
      const sendDto = dto as SendMessageDto;
      const message = this.messageRepository.create({
        teamId,
        userId,
        content: sendDto.content,
        messageType: sendDto.messageType || 'text',
        replyTo: sendDto.replyTo || null,
        mentions: sendDto.mentions || null,
        metadata: sendDto.metadata || null,
      });

      const savedMessage = await this.messageRepository.save(message);

      if (sendDto.mentions && sendDto.mentions.length > 0) {
        this.notifyMentions(teamId, sendDto.mentions, savedMessage.id).catch(() => undefined);
      }

      return savedMessage;
    }

    if (action === 'update' && messageId) {
      const message = await this.messageRepository.findOne({ where: { id: messageId, teamId, userId } });
      if (!message) {
        throw new NotFoundException('Message not found or you are not the author.');
      }

      const updateDto = dto as UpdateMessageDto;
      message.content = updateDto.content;
      message.editedAt = new Date();

      return this.messageRepository.save(message);
    }

    if (action === 'delete' && messageId) {
      const message = await this.messageRepository.findOne({ where: { id: messageId, teamId, userId } });
      if (!message) {
        throw new NotFoundException('Message not found or you are not the author.');
      }
      await this.messageRepository.remove(message);
      return { success: true };
    }

    if (action === 'react' && messageId) {
      const message = await this.messageRepository.findOne({ where: { id: messageId, teamId } });
      if (!message) {
        throw new NotFoundException('Message not found.');
      }

      const reactDto = dto as AddReactionDto;
      const reactions = message.reactions || [];
      const existingReaction = reactions.find((r) => r.emoji === reactDto.emoji);

      if (existingReaction) {
        if (existingReaction.userIds.includes(userId)) {
          existingReaction.userIds = existingReaction.userIds.filter((id) => id !== userId);
          if (existingReaction.userIds.length === 0) {
            message.reactions = reactions.filter((r) => r.emoji !== reactDto.emoji);
          }
        } else {
          existingReaction.userIds.push(userId);
        }
      } else {
        reactions.push({ emoji: reactDto.emoji, userIds: [userId] });
        message.reactions = reactions;
      }

      return this.messageRepository.save(message);
    }

    if (action === 'list') {
      return this.messageRepository.find({
        where: { teamId },
        order: { createdAt: 'DESC' },
        relations: ['user'],
        take: 100,
      });
    }

    throw new Error('Invalid action.');
  }

  async uploadResource(dto: UploadResourceDto, userId: string): Promise<TeamResource> {
    const team = await this.teamRepository.findOne({ where: { id: dto.teamId } });
    if (!team) {
      throw new NotFoundException('Team not found.');
    }

    const member = await this.memberRepository.findOne({
      where: { teamId: dto.teamId, userId, status: 'active' },
    });
    if (!member) {
      throw new ForbiddenException('You are not a member of this team.');
    }

    const resource = this.resourceRepository.create({
      teamId: dto.teamId,
      uploadedBy: userId,
      name: dto.name,
      url: dto.url,
      type: dto.type,
      size: BigInt(dto.size),
      description: dto.description || null,
      tags: dto.tags || null,
    });

    return this.resourceRepository.save(resource);
  }

  async getTeamResources(teamId: string, userId: string): Promise<TeamResource[]> {
    const team = await this.teamRepository.findOne({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('Team not found.');
    }

    const member = await this.memberRepository.findOne({
      where: { teamId, userId, status: 'active' },
    });
    if (!member) {
      throw new ForbiddenException('You are not a member of this team.');
    }

    return this.resourceRepository.find({
      where: { teamId },
      order: { createdAt: 'DESC' },
      relations: ['uploader'],
    });
  }

  async getTeamMembers(teamId: string, userId: string): Promise<TeamMember[]> {
    const team = await this.teamRepository.findOne({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('Team not found.');
    }

    const member = await this.memberRepository.findOne({
      where: { teamId, userId, status: 'active' },
    });
    if (!member) {
      throw new ForbiddenException('You are not a member of this team.');
    }

    return this.memberRepository.find({
      where: { teamId },
      relations: ['user'],
    });
  }

  async addTeamMember(teamId: string, userIdToAdd: string, requesterId: string): Promise<TeamMember> {
    const team = await this.teamRepository.findOne({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('Team not found.');
    }

    const requester = await this.memberRepository.findOne({
      where: { teamId, userId: requesterId, status: 'active' },
    });
    if (!requester || (requester.role !== 'owner' && requester.role !== 'admin')) {
      throw new ForbiddenException('You do not have permission to add members.');
    }

    const existingMember = await this.memberRepository.findOne({
      where: { teamId, userId: userIdToAdd },
    });
    if (existingMember) {
      throw new Error('User is already a member of this team.');
    }

    const member = this.memberRepository.create({
      teamId,
      userId: userIdToAdd,
      role: 'member',
      permissions: ['read', 'write'],
      status: 'pending',
    });

    return this.memberRepository.save(member);
  }

  async removeTeamMember(teamId: string, userIdToRemove: string, requesterId: string): Promise<void> {
    const team = await this.teamRepository.findOne({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('Team not found.');
    }

    const requester = await this.memberRepository.findOne({
      where: { teamId, userId: requesterId, status: 'active' },
    });
    if (!requester) {
      throw new ForbiddenException('You are not a member of this team.');
    }

    if (requester.role !== 'owner' && requester.role !== 'admin' && requesterId !== userIdToRemove) {
      throw new ForbiddenException('You do not have permission to remove this member.');
    }

    const member = await this.memberRepository.findOne({
      where: { teamId, userId: userIdToRemove },
    });
    if (!member) {
      throw new NotFoundException('Member not found.');
    }

    if (member.role === 'owner' && requesterId !== userIdToRemove) {
      throw new ForbiddenException('Cannot remove the team owner.');
    }

    await this.memberRepository.remove(member);
  }

  private async getNextTaskOrder(teamId: string): Promise<number> {
    const lastTask = await this.taskRepository.findOne({
      where: { teamId },
      order: { order: 'DESC' },
    });
    return lastTask ? lastTask.order + 1 : 0;
  }

  private async notifyMentions(teamId: string, userIds: string[], messageId: string): Promise<void> {
    for (const userId of userIds) {
      await this.notificationService.sendNotification(userId, {
        type: 'team_mention',
        teamId,
        messageId,
        message: 'You were mentioned in a team message.',
      });
    }
  }
}
