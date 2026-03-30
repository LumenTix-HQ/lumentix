import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { ListTransactionsDto } from './dto/list-transactions.dto';

@ApiTags('Transactions')
@Controller('transactions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get('export')
  @ApiOperation({
    summary: 'Export transactions as CSV',
    description: 'Downloads all authenticated user transactions as a CSV file, optionally filtered by date range. Capped at 10,000 rows.',
  })
  @ApiQuery({ name: 'from', required: false, description: 'Start date (ISO string)' })
  @ApiQuery({ name: 'to', required: false, description: 'End date (ISO string)' })
  @ApiResponse({ status: 200, description: 'CSV file' })
  @ApiResponse({ status: 400, description: 'Too many rows — use a narrower date range' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async export(
    @Req() req: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Res() res?: Response,
  ) {
    const transactions = await this.transactionsService.getAllForExport(
      req.user.id,
      from,
      to,
    );

    const header = [
      'id',
      'type',
      'status',
      'amount',
      'currency',
      'transactionHash',
      'referenceId',
      'createdAt',
    ];
    const csvRows = [header.join(',')];
    for (const tx of transactions) {
      csvRows.push(
        [
          tx.id,
          tx.type,
          tx.status,
          tx.amount,
          tx.currency,
          tx.transactionHash ?? '',
          tx.referenceId ?? '',
          tx.createdAt.toISOString(),
        ]
          .map((v) => '"' + String(v).replace(/"/g, '""') + '"')
          .join(','),
      );
    }
    const csv = csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="transactions-${Date.now()}.csv"`,
    );
    res.send(csv);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single transaction',
    description: 'Returns details of a specific transaction. Returns 403 if the transaction does not belong to the authenticated user.',
  })
  @ApiResponse({ status: 200, description: 'Transaction details' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.transactionsService.findOneByUser(id, req.user.id);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all transactions for the authenticated user',
    description: 'Returns a paginated, filterable list of the user\'s transactions.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of transactions' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll(@Req() req: AuthenticatedRequest, @Query() dto: ListTransactionsDto) {
    return this.transactionsService.findAllByUser(req.user.id, dto);
  }
}
