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
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { TicketsService } from './tickets.service';
import { IssueTicketDto } from './dto/issue-ticket.dto';
import { TransferTicketDto } from './dto/transfer-ticket.dto';
import { TicketEntity } from './entities/ticket.entity';

@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('my')
  @ApiOperation({
    summary: 'Get my tickets',
    description: 'Returns paginated tickets owned by the authenticated user.',
  })
  @ApiResponse({ status: 200, description: 'List of tickets' })
  async getMyTickets(
    @Req() req: AuthenticatedRequest,
    @Query() paginationDto: any,
  ) {
    return this.ticketsService.findByOwner(req.user.id, paginationDto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single ticket',
    description: 'Returns a single ticket if the user is authorized.',
  })
  @ApiResponse({
    status: 200,
    description: 'Ticket details',
    type: TicketEntity,
  })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async getTicket(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.ticketsService.findOne(id, req.user.id);
  }

  @Post('issue')
  @ApiOperation({
    summary: 'Issue a ticket',
    description: 'Issues a ticket for a confirmed payment.',
  })
  @ApiResponse({ status: 201, description: 'Ticket issued' })
  @ApiResponse({ status: 400, description: 'Payment not confirmed' })
  async issue(@Body() dto: IssueTicketDto) {
    return this.ticketsService.issueTicket(dto.paymentId);
  }

  @Post(':ticketId/transfer')
  @ApiOperation({
    summary: 'Transfer a ticket',
    description: 'Transfers ticket ownership to a new owner.',
  })
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
