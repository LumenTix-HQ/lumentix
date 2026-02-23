import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Transactions')
@Controller('transactions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  /**
   * GET /transactions
   * Returns all transactions for the authenticated user,
   * enriched with currencySymbol and currencyDisplayName.
   */
  @Get()
  @ApiOperation({ summary: 'Get all transactions for the authenticated user' })
  findAll(@Req() req: AuthenticatedRequest) {
    return this.transactionsService.findAllByUser(req.user.id);
  }
}
