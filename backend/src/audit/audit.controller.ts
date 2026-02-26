import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';
import { PaginationDto } from '../common/pagination/dto/pagination.dto';
import { paginate } from '../common/pagination/pagination.helper';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../admin/roles.guard';
import { Roles } from '../admin/roles.decorator';
import { UserRole } from '../users/entities/user-role.enum';
import { Response } from 'express';

@Controller('admin/audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AuditController {
	constructor(private readonly auditService: AuditService) {}

	@Get()
	async getAuditLogs(@Query() paginationDto: PaginationDto) {
		// Use TypeORM QueryBuilder for AuditLog
		const queryBuilder = this.auditService['auditLogRepository'].createQueryBuilder('audit');
		return await paginate(queryBuilder, paginationDto, 'audit');
	}

	@Get(':id')
	async getAuditLogById(@Param('id') id: string): Promise<AuditLog> {
		return await this.auditService['auditLogRepository'].findOneBy({ id });
	}

	@Get('export')
	async exportAuditLogs(@Query() paginationDto: PaginationDto, @Res() res: Response) {
		const queryBuilder = this.auditService['auditLogRepository'].createQueryBuilder('audit');
		const paginated = await paginate(queryBuilder, paginationDto, 'audit');
		const logs = paginated.data;

		// Convert logs to CSV
		const header = ['id', 'action', 'userId', 'resourceId', 'metadata', 'createdAt'];
		const csvRows = [header.join(',')];
		for (const log of logs) {
			csvRows.push([
				log.id,
				log.action,
				log.userId,
				log.resourceId ?? '',
				JSON.stringify(log.metadata ?? {}),
				log.createdAt.toISOString(),
			].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','));
		}
		const csv = csvRows.join('\n');
		res.setHeader('Content-Type', 'text/csv');
		res.setHeader('Content-Disposition', 'attachment; filename="audit_logs.csv"');
		res.send(csv);
	}
}

