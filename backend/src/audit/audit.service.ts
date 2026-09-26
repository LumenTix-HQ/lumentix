import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, LessThan } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';
import { paginate } from '../common/pagination/pagination.helper';

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

  /**
   * Search audit logs with the full filter set.
   *
   * `search` is a free-text term applied across the action, the actor, the
   * resource and the metadata blob, so an organizer can paste an ID or a word
   * out of a gift message and still land on the right row. It is combined
   * (AND) with the structured filters rather than replacing them.
   */
  async findLogs(dto: ListAuditLogsDto) {
    const qb = this.auditLogRepository.createQueryBuilder('log');

    if (dto.action) {
      qb.andWhere('log.action = :action', { action: dto.action });
    }
    if (dto.userId) {
      qb.andWhere('log.userId = :userId', { userId: dto.userId });
    }
    if (dto.resourceId) {
      qb.andWhere('log.resourceId = :resourceId', { resourceId: dto.resourceId });
    }
    if (dto.search) {
      const term = `%${dto.search.trim()}%`;
      qb.andWhere(
        `(log.action ILIKE :search
          OR log.userId ILIKE :search
          OR log.resourceId ILIKE :search
          OR log.metadata::text ILIKE :search)`,
        { search: term },
      );
    }
    if (dto.fromDate && dto.toDate) {
      qb.andWhere('log.createdAt BETWEEN :fromDate AND :toDate', {
        fromDate: new Date(dto.fromDate),
        toDate: new Date(dto.toDate),
      });
    } else if (dto.fromDate) {
      qb.andWhere('log.createdAt >= :fromDate', { fromDate: new Date(dto.fromDate) });
    } else if (dto.toDate) {
      qb.andWhere('log.createdAt <= :toDate', { toDate: new Date(dto.toDate) });
    }

    return paginate(qb, dto, 'log');
  }

  async list(dto: ListAuditLogsDto) {
    return this.findLogs(dto);
  }

  async prune(retentionDays: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const result = await this.auditLogRepository.delete({
      createdAt: LessThan(cutoff),
    });

    return result.affected ?? 0;
  }
}