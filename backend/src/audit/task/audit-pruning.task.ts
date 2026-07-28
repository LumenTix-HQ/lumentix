import {
  Injectable,
  Logger,
} from '@nestjs/common';

import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../audit.service';

@Injectable()
export class AuditPruningTask {
  private readonly logger =
    new Logger(AuditPruningTask.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  @Cron('0 2 * * *')
  async pruneOldLogs() {
    const retentionDays =
      this.configService.get<number>(
        'AUDIT_RETENTION_DAYS',
        90,
      );

    const deleted =
      await this.auditService.pruneLogs(
        retentionDays,
      );

    this.logger.log(
      `Deleted ${deleted} expired audit logs`,
    );
  }
}