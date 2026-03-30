import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
  Get,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { TicketsService } from './tickets.service';
import { IssueTicketDto } from './dto/issue-ticket.dto';
import { BulkIssueTicketDto } from './dto/bulk-issue-ticket.dto';
import { TransferTicketDto } from './dto/transfer-ticket.dto';
import { TicketEntity } from './entities/ticket.entity';

@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('my')
  @ApiOperation({ summary: 'Get my tickets' })
  @ApiResponse({ status: 200, description: 'List of tickets' })
  async getMyTickets(
    @Req() req: AuthenticatedRequest,
    @Query() paginationDto: any,
  ) {
    return this.ticketsService.findByOwner(req.user.id, paginationDto);
  }

  @Post('issue/bulk')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @ApiOperation({ summary: 'Bulk issue tickets for multiple confirmed payments' })
  @ApiResponse({ status: 201, description: 'Bulk issue results' })
  @ApiResponse({ status: 400, description: 'Batch size exceeded' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async bulkIssue(@Body() dto: BulkIssueTicketDto) {
    return this.ticketsService.bulkIssueTickets(dto.paymentIds);
  }

  @Post('issue')
  @ApiOperation({ summary: 'Issue a ticket for a confirmed payment' })
  @ApiResponse({ status: 201, description: 'Ticket issued' })
  @ApiResponse({ status: 400, description: 'Payment not confirmed' })
  async issue(@Body() dto: IssueTicketDto) {
    return this.ticketsService.issueTicket(dto.paymentId);
  }

  @Get(':id/qr')
  @ApiOperation({ summary: 'Regenerate QR code for a ticket' })
  @ApiResponse({ status: 200, description: 'QR code data URL' })
  @ApiResponse({ status: 400, description: 'Ticket not valid' })
  @ApiResponse({ status: 403, description: 'Not ticket owner' })
  async getQr(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.ticketsService.regenerateQr(id, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single ticket' })
  @ApiResponse({ status: 200, type: TicketEntity })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async getTicket(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.ticketsService.findOne(id, req.user.id);
  }

  @Post(':ticketId/transfer')
  @ApiOperation({ summary: 'Transfer a ticket to a new owner' })
  @ApiResponse({ status: 201, description: 'Ticket transferred' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async transfer(
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

/** Public controller — no JWT required. Used by gate scanners. */
@ApiTags('Tickets')
@Controller('tickets')
export class TicketsPublicController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get(':id/verify-status')
  @ApiOperation({
    summary: 'Verify ticket validity (public — no JWT required)',
    description: 'Called by gate scanners. Validates the cryptographic signature and returns ticket status.',
  })
  @ApiQuery({ name: 'signature', required: true })
  @ApiResponse({ status: 200, description: 'Ticket validity status' })
  async verifyStatus(
    @Param('id') id: string,
    @Query('signature') signature: string,
  ) {
    return this.ticketsService.getVerifyStatus(id, signature);
  }
}
