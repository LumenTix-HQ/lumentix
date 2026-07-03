import { ListAuditLogsDto } from '../audit/dto/list-audit-logs.dto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, IsNull } from 'typeorm';
import { paginate } from '../common/pagination/pagination.helper';
import { PaginatedResult } from '../common/pagination/interfaces/paginated-result.interface';
import { User } from '../users/entities/user.entity';
import { Event, EventStatus } from '../events/entities/event.entity';
import { RoleRequest, RoleRequestStatus } from '../users/entities/role-request.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { UserRole } from '../users/enums/user-role.enum';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';
import { ListAdminEventsDto } from './dto/list-admin-events.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { PaginationDto } from '../common/pagination/dto/pagination.dto';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../mailer/mailer.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RoleRequest)
    private readonly roleRequestRepository: Repository<RoleRequest>,
    private readonly auditService: AuditService,
    private readonly mailerService: MailerService,
  ) {}

  // ── Audit Logs ────────────────────────────────────────────────────────────

  async listAuditLogs(dto: ListAuditLogsDto) {
    return this.auditService.list(dto);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  async approveEvent(eventId: string): Promise<Event> {
    const event = await this.findEventOrFail(eventId);

    if (event.status !== EventStatus.DRAFT) {
      throw new BadRequestException(
        `Only draft events can be approved. Current status: "${event.status}".`,
      );
    }

    event.status = EventStatus.PUBLISHED;
    return this.eventRepository.save(event);
  }

  async suspendEvent(eventId: string): Promise<Event> {
    const event = await this.findEventOrFail(eventId);

    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('Event is already cancelled.');
    }

    if (event.status === EventStatus.COMPLETED) {
      throw new BadRequestException('Completed events cannot be suspended.');
    }

    event.status = EventStatus.CANCELLED;
    return this.eventRepository.save(event);
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async blockUser(userId: string): Promise<User> {
    const user = await this.findUserOrFail(userId);

    if (user.status === UserStatus.BLOCKED) {
      throw new BadRequestException('User is already blocked.');
    }

    user.status = UserStatus.BLOCKED;
    return this.userRepository.save(user);
  }

  async unblockUser(userId: string): Promise<User> {
    const user = await this.findUserOrFail(userId);

    if (user.status !== UserStatus.BLOCKED) {
      throw new BadRequestException('User is not blocked.');
    }

    user.status = UserStatus.ACTIVE;
    return this.userRepository.save(user);
  }

  async listUsers(dto: ListAdminUsersDto): Promise<PaginatedResult<User>> {
    const qb = this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.email',
        'user.role',
        'user.status',
        'user.stellarPublicKey',
        'user.balances',
        'user.balancesUpdatedAt',
        'user.notificationPreferences',
        'user.createdAt',
        'user.updatedAt',
        'user.deletedAt',
      ]);

    if (dto.role) {
      qb.andWhere('user.role = :role', { role: dto.role });
    }

    if (dto.status) {
      qb.andWhere('user.status = :status', { status: dto.status });
    }

    // Search by email (partial match)
    if (dto.search) {
      qb.andWhere('LOWER(user.email) LIKE LOWER(:search)', {
        search: `%${dto.search}%`,
      });
    }

    // Exclude soft-deleted unless includeDeleted is explicitly true
    if (!dto.includeDeleted) {
      qb.andWhere('user.deletedAt IS NULL');
    }

    return paginate(qb, dto, 'user');
  }

  async updateUser(
    userId: string,
    dto: UpdateAdminUserDto,
  ): Promise<User> {
    const user = await this.findUserOrFail(userId);

    if (dto.role !== undefined) {
      if (!Object.values(UserRole).includes(dto.role)) {
        throw new BadRequestException(`Invalid role value: ${dto.role}`);
      }
      user.role = dto.role;
    }

    return this.userRepository.save(user);
  }

  async softDeleteUser(userId: string): Promise<void> {
    const user = await this.findUserOrFail(userId);

    if (user.deletedAt) {
      throw new BadRequestException('User is already deleted.');
    }

    user.deletedAt = new Date();
    await this.userRepository.save(user);
  }

  async getUserById(userId: string): Promise<User> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.email',
        'user.role',
        'user.status',
        'user.stellarPublicKey',
        'user.balances',
        'user.balancesUpdatedAt',
        'user.notificationPreferences',
        'user.createdAt',
        'user.updatedAt',
        'user.deletedAt',
      ])
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) {
      throw new NotFoundException(`User "${userId}" not found.`);
    }

    return user;
  }

  async listAllEvents(
    dto: ListAdminEventsDto,
  ): Promise<PaginatedResult<Event>> {
    const qb = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndMapOne(
        'event.organizer',
        User,
        'organizer',
        'organizer.id = event.organizerId',
      )
      .select([
        'event',
        'organizer.id',
        'organizer.email',
        'organizer.role',
        'organizer.status',
        'organizer.stellarPublicKey',
        'organizer.createdAt',
        'organizer.updatedAt',
      ]);

    if (dto.status) {
      qb.andWhere('event.status = :status', { status: dto.status });
    }

    return paginate(qb, dto, 'event');
  }

  // ── Role Requests ─────────────────────────────────────────────────────────

  async listRoleRequests(dto: PaginationDto & { status?: RoleRequestStatus }) {
    const qb = this.roleRequestRepository.createQueryBuilder('rr');
    if (dto.status) {
      qb.where('rr.status = :status', { status: dto.status });
    }
    return paginate(qb, dto, 'rr');
  }

  async approveRoleRequest(id: string): Promise<RoleRequest> {
    const request = await this.findRoleRequestOrFail(id);
    if (request.status !== 'pending') {
      throw new ConflictException(
        `Role request is already "${request.status}" and cannot be re-processed.`,
      );
    }

    const user = await this.findUserOrFail(request.userId);
    user.role = request.requestedRole;
    await this.userRepository.save(user);

    request.status = 'approved';
    const saved = await this.roleRequestRepository.save(request);

    await this.auditService.log({
      action: 'ROLE_APPROVED',
      userId: request.userId,
      resourceId: request.id,
      meta: { requestedRole: request.requestedRole },
    });

    this.mailerService
      .send(
        user.email,
        'Your role request has been approved',
        `<p>Your request to become a <strong>${request.requestedRole}</strong> on Lumentix has been approved.</p>`,
      )
      .catch(() => undefined);

    return saved;
  }

  async rejectRoleRequest(id: string, reason?: string): Promise<RoleRequest> {
    const request = await this.findRoleRequestOrFail(id);
    if (request.status !== 'pending') {
      throw new ConflictException(
        `Role request is already "${request.status}" and cannot be re-processed.`,
      );
    }

    request.status = 'rejected';
    if (reason) request.reason = reason;
    const saved = await this.roleRequestRepository.save(request);

    await this.auditService.log({
      action: 'ROLE_REJECTED',
      userId: request.userId,
      resourceId: request.id,
      meta: { requestedRole: request.requestedRole, reason },
    });

    const user = await this.findUserOrFail(request.userId);
    this.mailerService
      .send(
        user.email,
        'Your role request has been declined',
        `<p>Your request to become a <strong>${request.requestedRole}</strong> on Lumentix has been declined.${reason ? ` Reason: ${reason}` : ''}</p>`,
      )
      .catch(() => undefined);

    return saved;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async findRoleRequestOrFail(id: string): Promise<RoleRequest> {
    const req = await this.roleRequestRepository.findOne({ where: { id } });
    if (!req) throw new NotFoundException(`Role request "${id}" not found.`);
    return req;
  }

  private async findEventOrFail(id: string): Promise<Event> {
    const event = await this.eventRepository.findOne({ where: { id } });
    if (!event) throw new NotFoundException(`Event "${id}" not found.`);
    return event;
  }

  private async findUserOrFail(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User "${id}" not found.`);
    return user;
  }
}