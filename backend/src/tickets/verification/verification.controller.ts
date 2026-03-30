import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { TicketsService } from '../tickets.service';
import { VerifyTicketDto } from './dto/verify-ticket.dto';
import { Roles, Role } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VerificationController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post('verify')
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @Roles(Role.ADMIN, Role.ORGANIZER)
  async verify(@Body() verifyTicketDto: VerifyTicketDto) {
    const { ticketId, signature } = verifyTicketDto;
    const ticket = await this.ticketsService.verifyTicket(ticketId, signature);

    return {
      message: 'Ticket verified successfully',
      ticketId: ticket.id,
      event: ticket.eventId,
      timestamp: new Date(),
    };
  }
}
