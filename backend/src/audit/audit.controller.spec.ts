import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PayloadTooLargeException } from '@nestjs/common';
import { Response } from 'express';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

function logRow(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'log-1',
    action: 'TICKET_GIFT_WRAPPED',
    userId: 'user-1',
    resourceId: 'gift-1',
    metadata: { ticketId: 'ticket-1' },
    createdAt: new Date('2026-01-15T10:30:00.000Z'),
    ...overrides,
  } as AuditLog;
}

function mockRes() {
  return {
    setHeader: jest.fn(),
    send: jest.fn(),
  } as unknown as Response & { setHeader: jest.Mock; send: jest.Mock };
}

describe('AuditController', () => {
  let controller: AuditController;
  let service: {
    findLogs: jest.Mock;
    findById: jest.Mock;
    getQueryBuilder: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findLogs: jest.fn().mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        lastPage: 1,
        hasNextPage: false,
      }),
      findById: jest.fn(),
      getQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: AuditService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<AuditController>(AuditController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAuditLogs', () => {
    it('delegates the filters to the service', async () => {
      const dto = { action: 'TICKET_GIFT_UNWRAPPED', search: 'gift' };

      await controller.getAuditLogs(dto);

      expect(service.findLogs).toHaveBeenCalledWith(dto);
    });

    it('passes the free-text search through', async () => {
      await controller.getAuditLogs({ search: 'birthday' });

      expect(service.findLogs).toHaveBeenCalledWith({ search: 'birthday' });
    });
  });

  describe('exportAuditLogs', () => {
    it('returns CSV and strips pagination so the whole set is exported', async () => {
      service.findLogs.mockResolvedValue({
        data: [logRow()],
        total: 1,
        page: 1,
        lastPage: 1,
      });
      const res = mockRes();

      await controller.exportAuditLogs({ page: 3, limit: 25, search: 'gift' }, res);

      expect(service.findLogs).toHaveBeenCalledWith({
        search: 'gift',
        page: 1,
        limit: 200,
      });
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      const csv = res.send.mock.calls[0][0] as string;
      expect(csv.split('\n')[0]).toBe(
        'id,action,userId,resourceId,metadata,createdAt',
      );
      expect(csv).toContain('TICKET_GIFT_WRAPPED');
    });

    it('escapes quotes in metadata so the CSV field round-trips', async () => {
      const metadata = { message: 'she said "hi"' };
      service.findLogs.mockResolvedValue({
        data: [logRow({ metadata })],
        total: 1,
        page: 1,
        lastPage: 1,
      });
      const res = mockRes();

      await controller.exportAuditLogs({}, res);

      const csv = res.send.mock.calls[0][0] as string;
      const metadataField = csv.split('\n')[1].split('","')[4];
      // CSV doubles every quote in a field, so un-doubling has to hand back
      // the original JSON text rather than a half-escaped string.
      const unescaped = metadataField.replace(/""/g, '"');
      expect(unescaped).toBe(JSON.stringify(metadata));
      expect(JSON.parse(unescaped)).toEqual(metadata);
    });
  });

  describe('exportAuditLogsJson', () => {
    it('returns the records as JSON with the metadata intact', async () => {
      service.findLogs.mockResolvedValue({
        data: [logRow()],
        total: 1,
        page: 1,
        lastPage: 1,
      });
      const res = mockRes();

      await controller.exportAuditLogsJson({ search: 'gift' }, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/json',
      );
      const payload = JSON.parse(res.send.mock.calls[0][0] as string);
      expect(payload).toEqual([
        {
          id: 'log-1',
          action: 'TICKET_GIFT_WRAPPED',
          userId: 'user-1',
          resourceId: 'gift-1',
          metadata: { ticketId: 'ticket-1' },
          createdAt: '2026-01-15T10:30:00.000Z',
        },
      ]);
    });

    it('substitutes an empty object when metadata is null', async () => {
      service.findLogs.mockResolvedValue({
        data: [logRow({ metadata: null })],
        total: 1,
        page: 1,
        lastPage: 1,
      });
      const res = mockRes();

      await controller.exportAuditLogsJson({}, res);

      expect(JSON.parse(res.send.mock.calls[0][0] as string)[0].metadata).toEqual(
        {},
      );
    });

    it('exports the whole filtered set rather than one page', async () => {
      const res = mockRes();

      await controller.exportAuditLogsJson({ page: 5, limit: 25 }, res);

      expect(service.findLogs).toHaveBeenCalledWith({ page: 1, limit: 200 });
    });

    it('walks past the first 200 rows instead of stopping at one page', async () => {
      const first = Array.from({ length: 200 }, (_, i) =>
        logRow({ id: `log-${i}` }),
      );
      const second = [logRow({ id: 'log-200' })];
      service.findLogs
        .mockResolvedValueOnce({
          data: first,
          total: 201,
          page: 1,
          lastPage: 2,
          hasNextPage: true,
        })
        .mockResolvedValueOnce({
          data: second,
          total: 201,
          page: 2,
          lastPage: 2,
          hasNextPage: false,
        });
      const res = mockRes();

      await controller.exportAuditLogsJson({}, res);

      expect(service.findLogs).toHaveBeenCalledTimes(2);
      expect(service.findLogs).toHaveBeenNthCalledWith(2, { page: 2, limit: 200 });
      const payload = JSON.parse(res.send.mock.calls[0][0] as string);
      expect(payload).toHaveLength(201);
      expect(payload.at(-1).id).toBe('log-200');
    });

    it('refuses a runaway export rather than truncating it', async () => {
      // Every page claims there is more, so only the row cap can stop this.
      service.findLogs.mockResolvedValue({
        data: Array.from({ length: 200 }, (_, i) => logRow({ id: `log-${i}` })),
        total: Number.MAX_SAFE_INTEGER,
        page: 1,
        lastPage: Number.MAX_SAFE_INTEGER,
        hasNextPage: true,
      });
      const res = mockRes();

      await expect(controller.exportAuditLogsJson({}, res)).rejects.toThrow(
        PayloadTooLargeException,
      );
      expect(res.send).not.toHaveBeenCalled();
    });
  });
});
