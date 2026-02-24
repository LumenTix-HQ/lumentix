import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { TicketsService } from '../tickets.service';
import { VerifyTicketDto } from './dto/verify-ticket.dto';
import { Roles } from '../../auth/decorators/roles.decorator'; // Adjust path
import { RolesGuard } from '../../auth/guards/roles.guard'; // Adjust path
import { UserRole } from '../../users/enums/user-role.enum';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'; // Assuming you have this

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VerificationController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post('verify')
  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
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
