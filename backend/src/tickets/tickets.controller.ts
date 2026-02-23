import { Body, Controller, Param, Post } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { IssueTicketDto } from './dto/issue-ticket.dto';
import { TransferTicketDto } from './dto/transfer-ticket.dto';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post('issue')
  async issue(@Body() dto: IssueTicketDto) {
    return this.ticketsService.issueTicket(dto.paymentId);
  }

  @Post(':ticketId/transfer')
  async transfer(
    @Param('ticketId') ticketId: string,
    @Body() dto: TransferTicketDto,
  ) {
    return this.ticketsService.transferTicket(
      ticketId,
      dto.callerOwnerId,
      dto.newOwnerId,
    );
  }
}
