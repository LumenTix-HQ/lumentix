import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AuditLog } from '../entities/audit-log.entity';

@Injectable()
export class AuditRetentionJob {
  private readonly logger = new Logger(AuditRetentionJob.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async deleteOldLogs() {
    const retentionDays = this.config.get<number>('AUDIT_RETENTION_DAYS') ?? 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .from(AuditLog)
      .where('createdAt < :cutoff', { cutoff })
      .execute();

    this.logger.log(
      `Audit retention: deleted ${result.affected ?? 0} logs older than ${retentionDays} days`,
    );
  }
}
