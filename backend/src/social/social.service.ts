import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ProfileVisibility,
  SocialProfile,
} from './entities/social-profile.entity';
import {
  AttendeeConnection,
  ConnectionStatus,
} from './entities/attendee-connection.entity';
import {
  MeetupGroup,
  MeetupGroupStatus,
} from './entities/meetup-group.entity';
import { MeetupMember, MeetupMemberRole } from './entities/meetup-member.entity';
import { EnableSocialFeaturesDto } from './dto/enable-social-features.dto';
import { ConnectAttendeesDto } from './dto/connect-attendees.dto';
import { CreateMeetupGroupDto } from './dto/create-meetup-group.dto';

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    @InjectRepository(SocialProfile)
    private readonly profileRepo: Repository<SocialProfile>,
    @InjectRepository(AttendeeConnection)
    private readonly connectionRepo: Repository<AttendeeConnection>,
    @InjectRepository(MeetupGroup)
    private readonly meetupGroupRepo: Repository<MeetupGroup>,
    @InjectRepository(MeetupMember)
    private readonly meetupMemberRepo: Repository<MeetupMember>,
  ) {}

  // ── Enable / Update Social Features ───────────────────────────────────────

  /**
   * Opt a user into social features by creating or updating their social profile.
   * Idempotent — calling again updates the existing profile.
   */
  async enableSocialFeatures(
    userId: string,
    dto: EnableSocialFeaturesDto,
  ): Promise<SocialProfile> {
    let profile = await this.profileRepo.findOne({ where: { userId } });

    if (!profile) {
      profile = this.profileRepo.create({ userId });
      this.logger.log(`Creating social profile for user ${userId}`);
    }

    if (dto.displayName !== undefined) profile.displayName = dto.displayName;
    if (dto.bio !== undefined) profile.bio = dto.bio;
    if (dto.title !== undefined) profile.title = dto.title;
    if (dto.socialLinks !== undefined) profile.socialLinks = dto.socialLinks;
    if (dto.interests !== undefined) profile.interests = dto.interests;
    if (dto.visibility !== undefined) profile.visibility = dto.visibility;
    if (dto.showInAttendeeList !== undefined)
      profile.showInAttendeeList = dto.showInAttendeeList;
    if (dto.acceptConnectionRequests !== undefined)
      profile.acceptConnectionRequests = dto.acceptConnectionRequests;
    if (dto.allowDirectMessages !== undefined)
      profile.allowDirectMessages = dto.allowDirectMessages;

    return this.profileRepo.save(profile);
  }

  /**
   * Disable social features — sets profile to private and hides from attendee lists.
   */
  async disableSocialFeatures(userId: string): Promise<void> {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) return;

    profile.visibility = ProfileVisibility.PRIVATE;
    profile.showInAttendeeList = false;
    profile.acceptConnectionRequests = false;
    profile.allowDirectMessages = false;
    await this.profileRepo.save(profile);
  }

  /**
   * Get a user's own social profile.
   */
  async getMyProfile(userId: string): Promise<SocialProfile | null> {
    return this.profileRepo.findOne({ where: { userId } });
  }

  // ── Attendee List for an Event ─────────────────────────────────────────────

  /**
   * Returns the public attendee list for an event.
   * Only includes users who have opted in and set showInAttendeeList = true.
   * Respects visibility settings — PRIVATE profiles are excluded.
   * CONNECTIONS_ONLY profiles are shown only to accepted connections of the viewer.
   */
  async getEventAttendeeList(
    eventId: string,
    viewerUserId: string,
    registeredUserIds: string[],
  ): Promise<SocialProfile[]> {
    if (registeredUserIds.length === 0) return [];

    // Fetch all opted-in profiles for registered users
    const profiles = await this.profileRepo
      .createQueryBuilder('sp')
      .where('sp.userId IN (:...userIds)', { userIds: registeredUserIds })
      .andWhere('sp.showInAttendeeList = true')
      .andWhere('sp.visibility != :private', {
        private: ProfileVisibility.PRIVATE,
      })
      .getMany();

    // Get viewer's accepted connections for CONNECTIONS_ONLY filtering
    const viewerConnections = await this.connectionRepo.find({
      where: [
        { requesterId: viewerUserId, status: ConnectionStatus.ACCEPTED },
        { recipientId: viewerUserId, status: ConnectionStatus.ACCEPTED },
      ],
    });

    const connectedUserIds = new Set(
      viewerConnections.map((c) =>
        c.requesterId === viewerUserId ? c.recipientId : c.requesterId,
      ),
    );

    return profiles.filter((p) => {
      if (p.userId === viewerUserId) return true; // always show own profile
      if (p.visibility === ProfileVisibility.PUBLIC) return true;
      if (
        p.visibility === ProfileVisibility.CONNECTIONS_ONLY &&
        connectedUserIds.has(p.userId)
      )
        return true;
      return false;
    });
  }

  // ── Connect Attendees ──────────────────────────────────────────────────────

  /**
   * Send a connection request from one attendee to another.
   * Both users must have social features enabled.
   * The recipient must have acceptConnectionRequests = true.
   */
  async connectAttendees(
    requesterId: string,
    dto: ConnectAttendeesDto,
  ): Promise<AttendeeConnection> {
    const { recipientId, message, eventId } = dto;

    if (requesterId === recipientId) {
      throw new BadRequestException('You cannot connect with yourself');
    }

    // Verify both users have social profiles
    const [requesterProfile, recipientProfile] = await Promise.all([
      this.profileRepo.findOne({ where: { userId: requesterId } }),
      this.profileRepo.findOne({ where: { userId: recipientId } }),
    ]);

    if (!requesterProfile) {
      throw new BadRequestException(
        'You must enable social features before connecting with others',
      );
    }

    if (!recipientProfile) {
      throw new NotFoundException(
        'The user you are trying to connect with has not enabled social features',
      );
    }

    if (!recipientProfile.acceptConnectionRequests) {
      throw new ForbiddenException(
        'This user is not accepting connection requests',
      );
    }

    // Check for existing connection
    const existing = await this.connectionRepo.findOne({
      where: [
        { requesterId, recipientId },
        { requesterId: recipientId, recipientId: requesterId },
      ],
    });

    if (existing) {
      if (existing.status === ConnectionStatus.ACCEPTED) {
        throw new ConflictException('You are already connected with this user');
      }
      if (existing.status === ConnectionStatus.PENDING) {
        throw new ConflictException(
          'A connection request is already pending with this user',
        );
      }
      if (existing.status === ConnectionStatus.BLOCKED) {
        throw new ForbiddenException('Unable to connect with this user');
      }
      // If declined, allow re-requesting
      existing.status = ConnectionStatus.PENDING;
      existing.message = message ?? null;
      existing.eventId = eventId ?? null;
      return this.connectionRepo.save(existing);
    }

    const connection = this.connectionRepo.create({
      requesterId,
      recipientId,
      status: ConnectionStatus.PENDING,
      message: message ?? null,
      eventId: eventId ?? null,
    });

    const saved = await this.connectionRepo.save(connection);
    this.logger.log(
      `Connection request from ${requesterId} to ${recipientId}`,
    );
    return saved;
  }

  /**
   * Accept or decline a connection request.
   */
  async respondToConnection(
    connectionId: string,
    userId: string,
    accept: boolean,
  ): Promise<AttendeeConnection> {
    const connection = await this.connectionRepo.findOne({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundException('Connection request not found');
    }

    if (connection.recipientId !== userId) {
      throw new ForbiddenException(
        'You can only respond to connection requests sent to you',
      );
    }

    if (connection.status !== ConnectionStatus.PENDING) {
      throw new BadRequestException(
        `Connection request is already ${connection.status}`,
      );
    }

    connection.status = accept
      ? ConnectionStatus.ACCEPTED
      : ConnectionStatus.DECLINED;

    return this.connectionRepo.save(connection);
  }

  /**
   * Block a user — prevents future connection requests.
   */
  async blockUser(
    blockerId: string,
    targetUserId: string,
  ): Promise<void> {
    if (blockerId === targetUserId) {
      throw new BadRequestException('You cannot block yourself');
    }

    const existing = await this.connectionRepo.findOne({
      where: [
        { requesterId: blockerId, recipientId: targetUserId },
        { requesterId: targetUserId, recipientId: blockerId },
      ],
    });

    if (existing) {
      existing.status = ConnectionStatus.BLOCKED;
      // Normalize so blocker is always the requester for clarity
      existing.requesterId = blockerId;
      existing.recipientId = targetUserId;
      await this.connectionRepo.save(existing);
    } else {
      await this.connectionRepo.save(
        this.connectionRepo.create({
          requesterId: blockerId,
          recipientId: targetUserId,
          status: ConnectionStatus.BLOCKED,
          message: null,
          eventId: null,
        }),
      );
    }
  }

  /**
   * Get all accepted connections for a user.
   */
  async getMyConnections(userId: string): Promise<AttendeeConnection[]> {
    return this.connectionRepo.find({
      where: [
        { requesterId: userId, status: ConnectionStatus.ACCEPTED },
        { recipientId: userId, status: ConnectionStatus.ACCEPTED },
      ],
      order: { updatedAt: 'DESC' },
    });
  }

  /**
   * Get pending incoming connection requests.
   */
  async getPendingRequests(userId: string): Promise<AttendeeConnection[]> {
    return this.connectionRepo.find({
      where: { recipientId: userId, status: ConnectionStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Meetup Groups ──────────────────────────────────────────────────────────

  /**
   * Create a meetup group for an event.
   * The creator must have social features enabled and be registered for the event.
   */
  async createMeetupGroup(
    creatorId: string,
    dto: CreateMeetupGroupDto,
  ): Promise<{ group: MeetupGroup; membership: MeetupMember }> {
    const creatorProfile = await this.profileRepo.findOne({
      where: { userId: creatorId },
    });

    if (!creatorProfile) {
      throw new BadRequestException(
        'You must enable social features before creating a meetup group',
      );
    }

    const group = await this.meetupGroupRepo.save(
      this.meetupGroupRepo.create({
        eventId: dto.eventId,
        creatorId,
        name: dto.name,
        description: dto.description ?? null,
        meetingPoint: dto.meetingPoint ?? null,
        meetingTime: dto.meetingTime ? new Date(dto.meetingTime) : null,
        maxMembers: dto.maxMembers ?? null,
        topics: dto.topics ?? null,
        status: MeetupGroupStatus.OPEN,
      }),
    );

    // Auto-add creator as a member with CREATOR role
    const membership = await this.meetupMemberRepo.save(
      this.meetupMemberRepo.create({
        groupId: group.id,
        userId: creatorId,
        role: MeetupMemberRole.CREATOR,
      }),
    );

    this.logger.log(
      `Meetup group "${group.name}" created by ${creatorId} for event ${dto.eventId}`,
    );

    return { group, membership };
  }

  /**
   * Join an existing meetup group.
   */
  async joinMeetupGroup(
    groupId: string,
    userId: string,
  ): Promise<MeetupMember> {
    const group = await this.meetupGroupRepo.findOne({ where: { id: groupId } });

    if (!group) throw new NotFoundException('Meetup group not found');

    if (group.status !== MeetupGroupStatus.OPEN) {
      throw new BadRequestException(
        `This meetup group is ${group.status} and not accepting new members`,
      );
    }

    const userProfile = await this.profileRepo.findOne({ where: { userId } });
    if (!userProfile) {
      throw new BadRequestException(
        'You must enable social features before joining a meetup group',
      );
    }

    const existing = await this.meetupMemberRepo.findOne({
      where: { groupId, userId },
    });
    if (existing) {
      throw new ConflictException('You are already a member of this group');
    }

    if (group.maxMembers !== null) {
      const memberCount = await this.meetupMemberRepo.count({
        where: { groupId },
      });
      if (memberCount >= group.maxMembers) {
        throw new BadRequestException('This meetup group is full');
      }
    }

    return this.meetupMemberRepo.save(
      this.meetupMemberRepo.create({
        groupId,
        userId,
        role: MeetupMemberRole.MEMBER,
      }),
    );
  }

  /**
   * Leave a meetup group.
   */
  async leaveMeetupGroup(groupId: string, userId: string): Promise<void> {
    const member = await this.meetupMemberRepo.findOne({
      where: { groupId, userId },
    });

    if (!member) throw new NotFoundException('You are not a member of this group');

    if (member.role === MeetupMemberRole.CREATOR) {
      throw new BadRequestException(
        'Group creators cannot leave. Close the group instead.',
      );
    }

    await this.meetupMemberRepo.remove(member);
  }

  /**
   * Close a meetup group (creator only).
   */
  async closeMeetupGroup(groupId: string, userId: string): Promise<MeetupGroup> {
    const group = await this.meetupGroupRepo.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Meetup group not found');

    if (group.creatorId !== userId) {
      throw new ForbiddenException('Only the group creator can close the group');
    }

    group.status = MeetupGroupStatus.CLOSED;
    return this.meetupGroupRepo.save(group);
  }

  /**
   * List all meetup groups for an event.
   */
  async listMeetupGroupsForEvent(eventId: string): Promise<
    (MeetupGroup & { memberCount: number })[]
  > {
    const groups = await this.meetupGroupRepo.find({
      where: { eventId, status: MeetupGroupStatus.OPEN },
      order: { createdAt: 'ASC' },
    });

    const enriched = await Promise.all(
      groups.map(async (g) => {
        const memberCount = await this.meetupMemberRepo.count({
          where: { groupId: g.id },
        });
        return { ...g, memberCount };
      }),
    );

    return enriched;
  }

  /**
   * Get members of a meetup group.
   */
  async getMeetupGroupMembers(groupId: string): Promise<MeetupMember[]> {
    const group = await this.meetupGroupRepo.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Meetup group not found');

    return this.meetupMemberRepo.find({
      where: { groupId },
      order: { joinedAt: 'ASC' },
    });
  }
}
