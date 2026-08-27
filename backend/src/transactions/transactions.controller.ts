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
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get('export')
  @ApiOperation({
    summary: 'Export transactions as CSV',
    description:
      'Authenticated. Downloads the current user\'s transactions as a CSV file, optionally filtered by date range.',
  })
  @ApiQuery({ name: 'from', required: false, description: 'Start date (ISO string)' })
  @ApiQuery({ name: 'to', required: false, description: 'End date (ISO string)' })
  @ApiResponse({ status: 200, description: 'Transactions exported successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async export(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
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
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
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

  @Get('stellar')
  @ApiOperation({
    summary: 'List Stellar Horizon transactions',
    description:
      'Authenticated. Returns the current user\'s Stellar account transaction history synced from Horizon.',
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Pagination cursor from previous response' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max records per page (1-200, default 20)' })
  @ApiResponse({ status: 200, description: 'Stellar transactions retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findStellar(
    @Req() req: AuthenticatedRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200) : 20;
    return this.transactionsService.getStellarTransactions(req.user.id, cursor, parsedLimit);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a transaction',
    description:
      'Authenticated. Returns details for a transaction owned by the current user.',
  })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiResponse({ status: 200, description: 'Transaction retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.transactionsService.findOneByUser(id, req.user.id);
  }

  @Get()
  @ApiOperation({
    summary: 'List transactions',
    description:
      'Authenticated. Returns a paginated and filterable list of transactions for the current user.',
  })
  @ApiResponse({ status: 200, description: 'Transactions retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll(@Req() req: AuthenticatedRequest, @Query() dto: ListTransactionsDto) {
    return this.transactionsService.findAllByUser(req.user.id, dto);
  }
}
