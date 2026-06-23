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
  async findLogs(
  query: AuditLogQueryDto,
) {
  const qb =
    this.auditLogRepository.createQueryBuilder(
      'audit',
    );

  if (query.action) {
    qb.andWhere(
      'audit.action = :action',
      {
        action: query.action,
      },
    );
  }

  if (query.userId) {
    qb.andWhere(
      'audit.userId = :userId',
      {
        userId: query.userId,
      },
    );
  }

  if (query.resourceId) {
    qb.andWhere(
      'audit.resourceId = :resourceId',
      {
        resourceId: query.resourceId,
      },
    );
  }

  if (query.fromDate) {
    qb.andWhere(
      'audit.createdAt >= :fromDate',
      {
        fromDate: query.fromDate,
      },
    );
  }

  if (query.toDate) {
    qb.andWhere(
      'audit.createdAt <= :toDate',
      {
        toDate: query.toDate,
      },
    );
  }

  qb.orderBy(
    'audit.createdAt',
    'DESC',
  );

  const skip =
    (query.page - 1) * query.limit;

  qb.skip(skip);
  qb.take(query.limit);

  const [items, total] =
    await qb.getManyAndCount();

  return {
    data: items,
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.ceil(
      total / query.limit,
    ),
  };
}
async pruneLogs(
  retentionDays: number,
): Promise<number> {
  const cutoff =
    new Date();

  cutoff.setDate(
    cutoff.getDate() - retentionDays,
  );

  const result =
    await this.auditLogRepository
      .createQueryBuilder()
      .delete()
      .where(
        'createdAt < :cutoff',
        { cutoff },
      )
      .execute();

  return result.affected ?? 0;
}
}
