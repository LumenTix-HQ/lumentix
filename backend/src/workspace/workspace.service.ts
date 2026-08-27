import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMember } from './entities/workspace-member.entity';
import { WorkspaceChange } from './entities/workspace-change.entity';
import { EventsService } from '../events/events.service';
import { WorkspaceChangeInputDto } from './dto/sync-workspace-changes.dto';

export interface SyncedChangeResult {
  field: string;
  conflict: boolean;
  resultVersion: number;
}

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepository: Repository<WorkspaceMember>,
    @InjectRepository(WorkspaceChange)
    private readonly changeRepository: Repository<WorkspaceChange>,
    private readonly eventsService: EventsService,
  ) {}

  async createWorkspace(eventId: string, requesterId: string): Promise<Workspace> {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== requesterId) {
      throw new ForbiddenException('Only the event organizer can create a workspace');
    }

    const existing = await this.workspaceRepository.findOne({ where: { eventId } });
    if (existing) {
      throw new BadRequestException('A workspace already exists for this event');
    }

    const workspace = await this.workspaceRepository.save(
      this.workspaceRepository.create({ eventId, version: 1 }),
    );

    await this.memberRepository.save(
      this.memberRepository.create({ workspaceId: workspace.id, userId: requesterId }),
    );

    return workspace;
  }

  async addWorkspaceMember(
    workspaceId: string,
    userId: string,
    requesterId: string,
  ): Promise<WorkspaceMember> {
    await this.getWorkspace(workspaceId, requesterId);

    const existing = await this.memberRepository.findOne({
      where: { workspaceId, userId },
    });
    if (existing) {
      return existing;
    }

    return this.memberRepository.save(
      this.memberRepository.create({ workspaceId, userId }),
    );
  }

  async getWorkspace(workspaceId: string, requesterId: string): Promise<Workspace> {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) {
      throw new NotFoundException(`Workspace with id "${workspaceId}" not found`);
    }

    await this.assertMember(workspaceId, requesterId);
    return workspace;
  }

  private async assertMember(workspaceId: string, userId: string): Promise<void> {
    const member = await this.memberRepository.findOne({ where: { workspaceId, userId } });
    if (!member) {
      throw new ForbiddenException('Only workspace members can access this workspace');
    }
  }

  /**
   * Applies a batch of edits to a workspace. A change is accepted directly
   * when its `baseVersion` matches the workspace's current version; otherwise
   * it is routed through `resolveEditConflict` (last-write-wins).
   */
  async syncWorkspaceChanges(
    workspaceId: string,
    userId: string,
    changes: WorkspaceChangeInputDto[],
  ): Promise<{ version: number; applied: SyncedChangeResult[] }> {
    const workspace = await this.getWorkspace(workspaceId, userId);

    const applied: SyncedChangeResult[] = [];
    const changeLogs: WorkspaceChange[] = [];

    for (const change of changes) {
      const isConflict = change.baseVersion !== workspace.version;
      const changeLog = isConflict
        ? this.resolveEditConflict(workspace, userId, change)
        : this.applyChange(workspace, userId, change);

      workspace.version = changeLog.resultVersion;
      changeLogs.push(changeLog);
      applied.push({
        field: change.field,
        conflict: changeLog.conflict,
        resultVersion: changeLog.resultVersion,
      });
    }

    await this.changeRepository.save(changeLogs);
    await this.workspaceRepository.save(workspace);

    return { version: workspace.version, applied };
  }

  private applyChange(
    workspace: Workspace,
    userId: string,
    change: WorkspaceChangeInputDto,
  ): WorkspaceChange {
    return this.changeRepository.create({
      workspaceId: workspace.id,
      userId,
      field: change.field,
      payload: change.payload,
      baseVersion: change.baseVersion,
      resultVersion: workspace.version + 1,
      conflict: false,
    });
  }

  /**
   * Last-write-wins conflict resolution: the incoming change is still
   * applied on top of the current version, but flagged so clients can
   * reconcile their local state against the authoritative payload.
   */
  private resolveEditConflict(
    workspace: Workspace,
    userId: string,
    change: WorkspaceChangeInputDto,
  ): WorkspaceChange {
    return this.changeRepository.create({
      workspaceId: workspace.id,
      userId,
      field: change.field,
      payload: change.payload,
      baseVersion: change.baseVersion,
      resultVersion: workspace.version + 1,
      conflict: true,
    });
  }
}
