import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AuditRetentionJob } from './audit-retention.job';
import { AuditLog } from '../entities/audit-log.entity';

describe('AuditRetentionJob', () => {
    let job: AuditRetentionJob;
    let repo: any;
    let config: ConfigService;

    const mockQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 5 }),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuditRetentionJob,
                {
                    provide: getRepositoryToken(AuditLog),
                    useValue: {
                        createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
                    },
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn().mockReturnValue(90),
                    },
                },
            ],
        }).compile();

        job = module.get<AuditRetentionJob>(AuditRetentionJob);
        repo = module.get(getRepositoryToken(AuditLog));
        config = module.get<ConfigService>(ConfigService);
    });

    it('should be defined', () => {
        expect(job).toBeDefined();
    });

    describe('deleteOldLogs', () => {
        it('should delete logs older than the retention period', async () => {
            const retentionDays = 90;
            await job.deleteOldLogs();

            expect(config.get).toHaveBeenCalledWith('AUDIT_RETENTION_DAYS');
            expect(repo.createQueryBuilder).toHaveBeenCalled();
            expect(mockQueryBuilder.delete).toHaveBeenCalled();
            expect(mockQueryBuilder.from).toHaveBeenCalledWith(AuditLog);
            expect(mockQueryBuilder.where).toHaveBeenCalledWith(
                'createdAt < :cutoff',
                expect.objectContaining({ cutoff: expect.any(Date) }),
            );
            expect(mockQueryBuilder.execute).toHaveBeenCalled();

            const cutoffSent = mockQueryBuilder.where.mock.calls[0][1].cutoff;
            const now = new Date();
            const expectedCutoff = new Date();
            expectedCutoff.setDate(now.getDate() - retentionDays);

            // Allow for a small time difference
            expect(cutoffSent.getTime()).toBeLessThanOrEqual(now.getTime());
            expect(now.getTime() - cutoffSent.getTime()).toBeGreaterThanOrEqual(retentionDays * 24 * 60 * 60 * 1000 - 1000);
        });

        it('should use default retention of 90 days if config is not set', async () => {
            jest.spyOn(config, 'get').mockReturnValue(undefined);
            await job.deleteOldLogs();

            const cutoffSent = mockQueryBuilder.where.mock.calls[1][1].cutoff;
            const expectedCutoff = new Date();
            expectedCutoff.setDate(expectedCutoff.getDate() - 90);

            // Roughly match the 90 day difference
            const diffDays = Math.round((new Date().getTime() - cutoffSent.getTime()) / (24 * 60 * 60 * 1000));
            expect(diffDays).toBe(90);
        });
    });
});
