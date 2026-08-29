import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/entities/audit-log.entity';

const CLEANUP_JOB_NAME = 'password-reset-token-cleanup';

/** Builds a cron expression firing every `intervalHours` hours, on the hour. Clamped to >= 1. */
export function buildCleanupCronExpression(intervalHours: number): string {
  const hours = Math.max(1, Math.floor(intervalHours) || 1);
  return `0 0 */${hours} * * *`;
}

/**
 * Purges used/expired rows from password_reset_tokens on a schedule.
 * Without this, the table grows unboundedly and stale token IDs remain
 * available for an attacker to enumerate/probe indefinitely.
 *
 * The interval is read from PASS_RESET_CLEANUP_INTERVAL_HOURS via
 * SchedulerRegistry.addCronJob() in onModuleInit() rather than a static
 * `@Cron(...)` decorator, since a decorator argument is evaluated at
 * class-definition time -- before Nest's DI container (and therefore
 * ConfigService/.env loading via ConfigModule.forRoot()) has necessarily
 * finished initializing.
 */
@Injectable()
export class PasswordResetCleanupTask implements OnModuleInit {
  private readonly logger = new Logger(PasswordResetCleanupTask.name);

  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokenRepository: Repository<PasswordResetToken>,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const intervalHours = this.configService.get<number>(
      'PASS_RESET_CLEANUP_INTERVAL_HOURS',
      1,
    );
    const cronExpression = buildCleanupCronExpression(intervalHours);

    const job = new CronJob(cronExpression, () => {
      void this.cleanup();
    });
    this.schedulerRegistry.addCronJob(CLEANUP_JOB_NAME, job);
    job.start();

    this.logger.log(
      `Password-reset token cleanup scheduled every ${intervalHours} hour(s) (cron: "${cronExpression}")`,
    );
  }

  /** Deletes used and/or expired password-reset tokens. Returns the count deleted. */
  async cleanup(): Promise<number> {
    const usedResult = await this.passwordResetTokenRepository.delete({ used: true });
    const expiredResult = await this.passwordResetTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });
    const deletedCount = (usedResult.affected ?? 0) + (expiredResult.affected ?? 0);

    if (deletedCount > 0) {
      await this.auditService.log({
        action: AuditAction.PASSWORD_RESET_TOKENS_PURGED,
        userId: 'system',
        meta: { count: deletedCount },
      });
    }

    this.logger.log(`Purged ${deletedCount} password reset token(s)`);
    return deletedCount;
  }
}
