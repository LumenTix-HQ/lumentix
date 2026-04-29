import {
  Controller,
  Get,
  NotFoundException,
  Param,
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
import { Roles } from '../admin/roles.decorator';
import { RolesGuard } from '../admin/roles.guard';
import { PaginationDto } from '../common/pagination/dto/pagination.dto';
import { paginate } from '../common/pagination/pagination.helper';
import { UserRole } from '../users/enums/user-role.enum';
import { AuditService } from './audit.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';
import { AuditLog } from './entities/audit-log.entity';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('admin/audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({
    summary: 'Get audit logs',
    description:
      'Authenticated admin endpoint. Returns paginated system audit logs with optional filters.',
  })
  @ApiResponse({ status: 200, description: 'Audit logs retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getAuditLogs(@Query() dto: ListAuditLogsDto) {
    const qb = this.auditService.getQueryBuilder();

    if (dto.action) {
      qb.andWhere('audit.action = :action', { action: dto.action });
    }

    if (dto.userId) {
      qb.andWhere('audit.userId = :userId', { userId: dto.userId });
    }

    if (dto.from) {
      qb.andWhere('audit.createdAt >= :from', { from: new Date(dto.from) });
    }

    if (dto.to) {
      qb.andWhere('audit.createdAt <= :to', { to: new Date(dto.to) });
    }

    return paginate(qb, dto, 'audit');
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
    summary: 'Export audit logs',
    description:
      'Authenticated admin endpoint. Exports audit logs as a CSV file.',
  })
  @ApiResponse({ status: 200, description: 'Audit log CSV generated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async exportAuditLogs(
    @Query() paginationDto: PaginationDto,
    @Res() res: Response,
  ) {
    const qb = this.auditService.getQueryBuilder();
    const paginated = await paginate(qb, paginationDto, 'audit');
    const logs = paginated.data;

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
}
