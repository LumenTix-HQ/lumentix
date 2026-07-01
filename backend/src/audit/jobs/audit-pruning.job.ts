import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit.service';

@Injectable()
export class AuditPruningJob {
  private readonly logger = new Logger(AuditPruningJob.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    const retentionDays = this.configService.get<number>('AUDIT_RETENTION_DAYS', 90);
    this.logger.log(`Pruning audit logs older than ${retentionDays} days`);

    const deletedCount = await this.auditService.prune(retentionDays);
    this.logger.log(`Pruned ${deletedCount} audit logs`);
  }
}