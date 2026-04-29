import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export interface AuditLogEntry {
  action: string;
  userId: string;
  resourceId?: string;
  meta?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    public readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  getQueryBuilder(): SelectQueryBuilder<AuditLog> {
    return this.auditLogRepository.createQueryBuilder('audit');
  }

  findById(id: string): Promise<AuditLog | null> {
    return this.auditLogRepository.findOneBy({ id });
  }

  async log(entry: AuditLogEntry): Promise<AuditLog> {
    const record = this.auditLogRepository.create({
      action: entry.action,
      userId: entry.userId,
      resourceId: entry.resourceId ?? null,
      metadata: entry.meta ?? null,
    });

    const saved = await this.auditLogRepository.save(record);

    this.logger.log(
      `[AUDIT] action=${saved.action} userId=${saved.userId} resourceId=${saved.resourceId ?? 'n/a'}`,
    );

    return saved;
  }
}
