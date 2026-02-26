    /**
     * GET /tickets/:id
     * Returns a single ticket if the user is authorized.
     */
    @Get(':id')
    async getTicket(
      @Param('id') id: string,
      @Req() req: AuthenticatedRequest,
    ) {
      return this.ticketsService.findOne(id, req.user.id);
    }
  /**
   * GET /tickets/my
   * Returns paginated tickets owned by the authenticated user.
   */
  @Get('my')
  async getMyTickets(
    @Req() req: AuthenticatedRequest,
    @Query() paginationDto: any,
  ) {
    return this.ticketsService.findByOwner(req.user.id, paginationDto);
  }
import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { TicketsService } from './tickets.service';
import { IssueTicketDto } from './dto/issue-ticket.dto';
import { TransferTicketDto } from './dto/transfer-ticket.dto';

@Controller('tickets')
@UseGuards(JwtAuthGuard) // ← Applies to every endpoint in this controller
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  /**
   * POST /tickets/issue
   * Issues a ticket for a confirmed payment.
   * The payment must belong to the authenticated user — validated inside
   * TicketsService via the payment's userId field.
   */
  @Post('issue')
  async issue(@Body() dto: IssueTicketDto) {
    return this.ticketsService.issueTicket(dto.paymentId);
  }

  /**
   * POST /tickets/:ticketId/transfer
   * Transfers ticket ownership to newOwnerId.
   * callerOwnerId is always taken from the verified JWT — never from the body.
   */
  @Post(':ticketId/transfer')
  async transfer(
    @Param('ticketId') ticketId: string,
    @Body() dto: TransferTicketDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.ticketsService.transferTicket(
      ticketId,
      req.user.id, // ← sourced from JWT, not request body
      dto.newOwnerId,
    );
  }
}
