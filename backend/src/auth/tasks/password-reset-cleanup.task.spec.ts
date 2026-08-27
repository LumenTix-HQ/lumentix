import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  PasswordResetCleanupTask,
  buildCleanupCronExpression,
} from './password-reset-cleanup.task';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/entities/audit-log.entity';

describe('buildCleanupCronExpression', () => {
  it('builds an every-N-hours expression', () => {
    expect(buildCleanupCronExpression(6)).toBe('0 0 */6 * * *');
  });

  it('clamps intervals below 1 hour to 1', () => {
    expect(buildCleanupCronExpression(0)).toBe('0 0 */1 * * *');
    expect(buildCleanupCronExpression(-5)).toBe('0 0 */1 * * *');
  });
});

describe('PasswordResetCleanupTask', () => {
  let task: PasswordResetCleanupTask;
  let repository: { delete: jest.Mock };
  let auditService: { log: jest.Mock };
  let configService: { get: jest.Mock };
  let schedulerRegistry: { addCronJob: jest.Mock };

  beforeEach(async () => {
    repository = { delete: jest.fn() };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    configService = { get: jest.fn().mockReturnValue(1) };
    schedulerRegistry = { addCronJob: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordResetCleanupTask,
        { provide: getRepositoryToken(PasswordResetToken), useValue: repository },
        { provide: AuditService, useValue: auditService },
        { provide: ConfigService, useValue: configService },
        { provide: SchedulerRegistry, useValue: schedulerRegistry },
      ],
    }).compile();

    task = module.get<PasswordResetCleanupTask>(PasswordResetCleanupTask);
  });

  describe('cleanup', () => {
    it('deletes used tokens and expired tokens, summing the affected counts', async () => {
      repository.delete
        .mockResolvedValueOnce({ affected: 3 }) // used: true
        .mockResolvedValueOnce({ affected: 2 }); // expiresAt < now

      const count = await task.cleanup();

      expect(count).toBe(5);
      expect(repository.delete).toHaveBeenNthCalledWith(1, { used: true });
      expect(repository.delete.mock.calls[1][0]).toHaveProperty('expiresAt');
    });

    it('logs a PASSWORD_RESET_TOKENS_PURGED audit entry with the deleted count', async () => {
      repository.delete
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({ affected: 0 });

      await task.cleanup();

      expect(auditService.log).toHaveBeenCalledWith({
        action: AuditAction.PASSWORD_RESET_TOKENS_PURGED,
        userId: 'system',
        meta: { count: 1 },
      });
    });

    it('does not write an audit entry when nothing was deleted', async () => {
      repository.delete
        .mockResolvedValueOnce({ affected: 0 })
        .mockResolvedValueOnce({ affected: 0 });

      const count = await task.cleanup();

      expect(count).toBe(0);
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('treats a null `affected` count as zero', async () => {
      repository.delete
        .mockResolvedValueOnce({ affected: null })
        .mockResolvedValueOnce({ affected: null });

      const count = await task.cleanup();
      expect(count).toBe(0);
    });
  });

  describe('onModuleInit', () => {
    it('registers a cron job named "password-reset-token-cleanup"', () => {
      task.onModuleInit();

      expect(schedulerRegistry.addCronJob).toHaveBeenCalledTimes(1);
      const [jobName] = schedulerRegistry.addCronJob.mock.calls[0];
      expect(jobName).toBe('password-reset-token-cleanup');
    });

    it('reads the interval from PASS_RESET_CLEANUP_INTERVAL_HOURS with a default of 1', () => {
      task.onModuleInit();

      expect(configService.get).toHaveBeenCalledWith(
        'PASS_RESET_CLEANUP_INTERVAL_HOURS',
        1,
      );
    });
  });
});
