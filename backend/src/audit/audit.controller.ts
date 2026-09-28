import {
  Controller,
  Get,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PaginationDto } from '../common/pagination/dto/pagination.dto';
import { paginate } from '../common/pagination/pagination.helper';
import { UserRole } from '../users/enums/user-role.enum';
import { AuditService } from './audit.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';
import { AuditLog } from './entities/audit-log.entity';

/** Rows fetched per query while walking an export. */
const EXPORT_PAGE_SIZE = 200;
/** Upper bound on a single export, so a wide filter cannot exhaust memory. */
const EXPORT_MAX_ROWS = 50_000;

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('admin/audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}


  @Get()
  @ApiOperation({
    summary: 'Search audit logs',
    description:
      'Authenticated admin endpoint. Returns paginated system audit logs with optional structured filters and a free-text `search` term.',
  })
  @ApiResponse({ status: 200, description: 'Audit logs retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid audit query' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getAuditLogs(@Query() dto: ListAuditLogsDto) {
    return this.auditService.findLogs(dto);
  }

  @Get('user/:userId')
  @ApiOperation({
    summary: 'Get user audit logs',
    description:
      'Authenticated admin endpoint. Returns paginated audit logs for a specific user.',
  })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User audit logs retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getAuditLogsForUser(
    @Param('userId') userId: string,
    @Query() paginationDto: PaginationDto,
  ) {
    const qb = this.auditService
      .getQueryBuilder()
      .where('audit.userId = :userId', { userId })
      .orderBy('audit.createdAt', 'DESC');

    return paginate(qb, paginationDto, 'audit');
  }

  @Get('export')
  @ApiOperation({
    summary: 'Export audit logs as CSV',
    description:
      'Authenticated admin endpoint. Exports every audit log matching the supplied filters as a CSV file, ignoring pagination so the export covers the whole filtered set. Exports above 50,000 rows are refused with 413 rather than truncated.',
  })
  @ApiResponse({ status: 200, description: 'Audit log CSV generated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 413, description: 'Too many matching rows; narrow the filters' })
  async exportAuditLogs(@Query() dto: ListAuditLogsDto, @Res() res: Response) {
    const logs = await this.resolveExportRows(dto);

    const header = [
      'id',
      'action',
      'userId',
      'resourceId',
      'metadata',
      'createdAt',
    ];
    const csvRows = [header.join(',')];
    for (const log of logs) {
      csvRows.push(
        [
          log.id,
          log.action,
          log.userId,
          log.resourceId ?? '',
          JSON.stringify(log.metadata ?? {}),
          log.createdAt.toISOString(),
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(','),
      );
    }

    const csv = csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit_logs.csv"');
    res.send(csv);
  }

  @Get('export/json')
  @ApiOperation({
    summary: 'Export audit logs as JSON',
    description:
      'Authenticated admin endpoint. Same filtering as the CSV export, but returns the raw records so the metadata blob survives the round trip.',
  })
  @ApiResponse({ status: 200, description: 'Audit log JSON generated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 413, description: 'Too many matching rows; narrow the filters' })
  async exportAuditLogsJson(@Query() dto: ListAuditLogsDto, @Res() res: Response) {
    const logs = await this.resolveExportRows(dto);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="audit_logs.json"',
    );
    res.send(
      JSON.stringify(
        logs.map((log) => ({
          id: log.id,
          action: log.action,
          userId: log.userId,
          resourceId: log.resourceId,
          metadata: log.metadata ?? {},
          createdAt: log.createdAt.toISOString(),
        })),
        null,
        2,
      ),
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get audit log by ID',
    description:
      'Authenticated admin endpoint. Retrieves details for a specific audit log entry.',
  })
  @ApiParam({ name: 'id', description: 'Audit log UUID' })
  @ApiResponse({ status: 200, description: 'Audit log found', type: AuditLog })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Audit log not found' })
  async getAuditLogById(@Param('id') id: string): Promise<AuditLog> {
    const log = await this.auditService.findById(id);
    if (!log) {
      throw new NotFoundException('Audit log not found');
    }

    return log;
  }

  /**
   * Load every record matching the filters for an export.
   *
   * Pagination is stripped so an export covers the whole filtered set rather
   * than whichever page the viewer happened to be on. The rows are walked one
   * page at a time instead of in a single unbounded query so a wide filter
   * cannot pull an entire audit table into memory, and `EXPORT_MAX_ROWS` stops
   * a runaway export. Silently truncating would be worse than refusing: an
   * admin who exports 5,000 rows must be able to trust that they got 5,000.
   */
  private async resolveExportRows(dto: ListAuditLogsDto) {
    const { page, limit, ...filters } = dto;
    const rows: AuditLog[] = [];

    for (let next = 1; ; next += 1) {
      const result = await this.auditService.findLogs({
        ...filters,
        page: next,
        limit: EXPORT_PAGE_SIZE,
      });

      rows.push(...result.data);

      if (rows.length >= EXPORT_MAX_ROWS) {
        throw new PayloadTooLargeException(
          `Refusing to export more than ${EXPORT_MAX_ROWS} audit logs. Narrow the filters or narrow the date range and try again.`,
        );
      }
      if (!result.hasNextPage) {
        return rows;
      }
    }
  }
}
