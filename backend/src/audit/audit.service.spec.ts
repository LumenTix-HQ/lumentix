import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;
  let qb: {
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    skip: jest.Mock;
    take: jest.Mock;
    getCount: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(async () => {
    qb = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      getMany: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(qb),
            create: jest.fn(),
            save: jest.fn(),
            findOneBy: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findLogs', () => {
    it('filters by action', async () => {
      await service.findLogs({ action: 'LOGIN', page: 1, limit: 20 });

      expect(qb.andWhere).toHaveBeenCalledWith('log.action = :action', {
        action: 'LOGIN',
      });
    });

    it('filters by userId', async () => {
      await service.findLogs({ userId: 'u1', page: 1, limit: 20 });

      expect(qb.andWhere).toHaveBeenCalledWith('log.userId = :userId', {
        userId: 'u1',
      });
    });

    it('filters by resourceId', async () => {
      await service.findLogs({ resourceId: 'gift-1', page: 1, limit: 20 });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'log.resourceId = :resourceId',
        { resourceId: 'gift-1' },
      );
    });

    it('applies a free-text search across action, ids and metadata', async () => {
      await service.findLogs({ search: 'gift', page: 1, limit: 20 });

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('log.action ILIKE :search'),
        { search: '%gift%' },
      );
      const [sql, params] = qb.andWhere.mock.calls.at(-1);
      expect(sql).toContain('log.metadata::text ILIKE :search');
      expect(params).toEqual({ search: '%gift%' });
    });

    it('trims the search term before wrapping it', async () => {
      await service.findLogs({ search: '  gift  ', page: 1, limit: 20 });

      expect(qb.andWhere).toHaveBeenCalledWith(expect.any(String), {
        search: '%gift%',
      });
    });

    it('combines the search term with the structured filters', async () => {
      await service.findLogs({
        action: 'TICKET_GIFT_UNWRAPPED',
        search: 'gift-1',
        page: 1,
        limit: 20,
      });

      const statements = qb.andWhere.mock.calls.map(([sql]) => sql);
      expect(statements).toContain('log.action = :action');
      expect(statements.some((s) => s.includes('ILIKE :search'))).toBe(true);
    });

    it('uses a half-open range when only fromDate is given', async () => {
      const from = new Date('2026-01-01');
      await service.findLogs({ fromDate: from.toISOString(), page: 1, limit: 20 });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'log.createdAt >= :fromDate',
        { fromDate: from },
      );
    });

    it('uses a bounded range when both dates are given', async () => {
      const from = new Date('2026-01-01');
      const to = new Date('2026-02-01');
      await service.findLogs({
        fromDate: from.toISOString(),
        toDate: to.toISOString(),
        page: 1,
        limit: 20,
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'log.createdAt BETWEEN :fromDate AND :toDate',
        { fromDate: from, toDate: to },
      );
    });

    it('adds no conditions when no filters are supplied', async () => {
      await service.findLogs({ page: 1, limit: 20 });

      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('is aliased so list() and findLogs() behave identically', async () => {
      await service.list({ action: 'LOGIN', page: 1, limit: 20 });

      expect(qb.andWhere).toHaveBeenCalledWith('log.action = :action', {
        action: 'LOGIN',
      });
    });
  });
});
