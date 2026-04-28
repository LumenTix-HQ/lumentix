import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { BulkIssueTicketDto } from './dto/bulk-issue-ticket.dto';
import { IssueTicketDto } from './dto/issue-ticket.dto';
import { TransferTicketDto } from './dto/transfer-ticket.dto';
import { TicketEntity } from './entities/ticket.entity';
import { TicketsService } from './tickets.service';

@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('my')
  @ApiOperation({
    summary: 'Get my tickets',
    description: 'Authenticated. Returns tickets owned by the current user.',
  })
  @ApiResponse({ status: 200, description: 'List of tickets' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMyTickets(
    @Req() req: AuthenticatedRequest,
    @Query() paginationDto: any,
  ) {
    return this.ticketsService.findByOwner(req.user.id, paginationDto);
  }

  @Post('issue/bulk')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @ApiOperation({
    summary: 'Bulk issue tickets',
    description:
      'Authenticated organizer/admin endpoint. Issues tickets for multiple confirmed payments.',
  })
  @ApiResponse({ status: 201, description: 'Bulk issue results' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  bulkIssue(@Body() dto: BulkIssueTicketDto) {
    return this.ticketsService.bulkIssueTickets(dto.paymentIds);
  }

  @Post('issue')
  @ApiOperation({
    summary: 'Issue a ticket',
    description:
      'Authenticated. Issues a ticket for a confirmed payment reference.',
  })
  @ApiResponse({ status: 201, description: 'Ticket issued' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  issue(@Body() dto: IssueTicketDto) {
    return this.ticketsService.issueTicket(dto.paymentId);
  }

  @Get(':id/qr')
  @ApiOperation({
    summary: 'Regenerate ticket QR code',
    description:
      'Authenticated. Regenerates QR code data for a ticket owned by the current user.',
  })
  @ApiParam({ name: 'id', description: 'Ticket UUID' })
  @ApiResponse({ status: 200, description: 'QR code regenerated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getQr(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.ticketsService.regenerateQr(id, req.user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a ticket',
    description:
      'Authenticated. Retrieves a single ticket visible to the current user.',
  })
  @ApiParam({ name: 'id', description: 'Ticket UUID' })
  @ApiResponse({ status: 200, description: 'Ticket found', type: TicketEntity })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  getTicket(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.ticketsService.findOne(id, req.user.id);
  }

  @Post(':ticketId/transfer')
  @ApiOperation({
    summary: 'Transfer a ticket',
    description:
      'Authenticated. Transfers a ticket from the current owner to a new owner.',
  })
  @ApiParam({ name: 'ticketId', description: 'Ticket UUID' })
  @ApiResponse({ status: 201, description: 'Ticket transferred successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  transfer(
    @Param('ticketId') ticketId: string,
    @Body() dto: TransferTicketDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.ticketsService.transferTicket(
      ticketId,
      req.user.id,
      dto.newOwnerId,
    );
  }
}

@ApiTags('Tickets')
@Controller('tickets')
export class TicketsPublicController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('marketplace')
  @ApiOperation({
    summary: 'Browse marketplace tickets',
    description: 'Public. Returns tickets currently listed for resale.',
  })
  @ApiResponse({ status: 200, description: 'Listed tickets retrieved successfully' })
  getMarketplace() {
    return this.ticketsService.getMarketplace();
  }

  @Get(':id/verify-status')
  @ApiOperation({
    summary: 'Verify ticket status',
    description:
      'Public. Validates the provided ticket signature and returns the current ticket validity status.',
  })
  @ApiParam({ name: 'id', description: 'Ticket UUID' })
  @ApiQuery({
    name: 'signature',
    required: true,
    description: 'Signature generated for ticket verification',
  })
  @ApiResponse({ status: 200, description: 'Ticket validity status returned' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  verifyStatus(
    @Param('id') id: string,
    @Query('signature') signature: string,
  ) {
    return this.ticketsService.getVerifyStatus(id, signature);
  }
}
