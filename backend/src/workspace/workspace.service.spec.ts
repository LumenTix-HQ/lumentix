import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceService } from './workspace.service';

describe('WorkspaceService', () => {
  let workspaceRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let memberRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let changeRepo: { find: jest.Mock; save: jest.Mock; create: jest.Mock };
  let eventsService: { getEventById: jest.Mock };
  let service: WorkspaceService;

  const identity = (v: unknown) => v;

  beforeEach(() => {
    workspaceRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (v) => ({ id: 'w1', ...v })),
      create: jest.fn().mockImplementation(identity),
    };
    memberRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (v) => v),
      create: jest.fn().mockImplementation(identity),
    };
    changeRepo = {
      find: jest.fn(),
      save: jest.fn().mockImplementation(async (v) => v),
      create: jest.fn().mockImplementation(identity),
    };
    eventsService = { getEventById: jest.fn() };
    service = new WorkspaceService(
      workspaceRepo as never,
      memberRepo as never,
      changeRepo as never,
      eventsService as never,
    );
  });

  describe('createWorkspace', () => {
    it('creates a workspace and enrols the organizer as a member', async () => {
      eventsService.getEventById.mockResolvedValue({ organizerId: 'org1' });
      workspaceRepo.findOne.mockResolvedValue(null);

      const ws = await service.createWorkspace('e1', 'org1');

      expect(ws).toMatchObject({ id: 'w1', eventId: 'e1', version: 1 });
      expect(memberRepo.save).toHaveBeenCalledWith({
        workspaceId: 'w1',
        userId: 'org1',
      });
    });

    it('rejects non-organizers', async () => {
      eventsService.getEventById.mockResolvedValue({ organizerId: 'org1' });
      await expect(
        service.createWorkspace('e1', 'intruder'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a second workspace for the same event', async () => {
      eventsService.getEventById.mockResolvedValue({ organizerId: 'org1' });
      workspaceRepo.findOne.mockResolvedValue({ id: 'w1' });
      await expect(
        service.createWorkspace('e1', 'org1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getWorkspace', () => {
    it('throws NotFound for an unknown workspace', async () => {
      workspaceRepo.findOne.mockResolvedValue(null);
      await expect(service.getWorkspace('w1', 'u1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws Forbidden for non-members', async () => {
      workspaceRepo.findOne.mockResolvedValue({ id: 'w1', version: 1 });
      memberRepo.findOne.mockResolvedValue(null);
      await expect(service.getWorkspace('w1', 'u1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('syncWorkspaceChanges', () => {
    beforeEach(() => {
      workspaceRepo.findOne.mockResolvedValue({ id: 'w1', version: 1 });
      memberRepo.findOne.mockResolvedValue({ id: 'm1' });
    });

    it('applies an up-to-date change without flagging a conflict', async () => {
      const result = await service.syncWorkspaceChanges('w1', 'u1', [
        { field: 'title', payload: { value: 'A' }, baseVersion: 1 } as never,
      ]);

      expect(result).toEqual({
        version: 2,
        applied: [{ field: 'title', conflict: false, resultVersion: 2 }],
      });
    });

    it('flags a stale change as a conflict but still applies it (last-write-wins)', async () => {
      const result = await service.syncWorkspaceChanges('w1', 'u1', [
        { field: 'title', payload: { value: 'A' }, baseVersion: 0 } as never,
      ]);

      expect(result.applied[0]).toEqual({
        field: 'title',
        conflict: true,
        resultVersion: 2,
      });
      expect(result.version).toBe(2);
    });

    it('chains versions across a batch', async () => {
      const result = await service.syncWorkspaceChanges('w1', 'u1', [
        { field: 'a', payload: {}, baseVersion: 1 } as never,
        { field: 'b', payload: {}, baseVersion: 1 } as never,
      ]);

      expect(result.applied.map((c) => [c.conflict, c.resultVersion])).toEqual([
        [false, 2],
        [true, 3],
      ]);
      expect(result.version).toBe(3);
      expect(changeRepo.save).toHaveBeenCalledTimes(1);
    });

    it('rejects non-members before applying anything', async () => {
      memberRepo.findOne.mockResolvedValue(null);
      await expect(
        service.syncWorkspaceChanges('w1', 'u1', [
          { field: 'a', payload: {}, baseVersion: 1 } as never,
        ]),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(changeRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('resolveEditConflictManual', () => {
    beforeEach(() => {
      workspaceRepo.findOne.mockResolvedValue({ id: 'w1', version: 4 });
      memberRepo.findOne.mockResolvedValue({ id: 'm1' });
    });

    it('accepting records a clean change and bumps the version', async () => {
      const res = await service.resolveEditConflictManual(
        'w1',
        'u1',
        'title',
        'accept',
        {
          value: 'B',
        },
      );
      expect(res).toEqual({ resolved: true, field: 'title', version: 5 });
      expect(changeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          conflict: false,
          resultVersion: 5,
          payload: { value: 'B' },
        }),
      );
    });

    it('rejecting leaves the workspace untouched', async () => {
      const res = await service.resolveEditConflictManual(
        'w1',
        'u1',
        'title',
        'reject',
      );
      expect(res).toEqual({
        resolved: false,
        field: 'title',
        reason: 'rejected',
      });
      expect(changeRepo.save).not.toHaveBeenCalled();
    });
  });
});
