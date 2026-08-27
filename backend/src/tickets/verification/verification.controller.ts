import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { TicketsService } from '../tickets.service';
import { VerifyTicketDto } from './dto/verify-ticket.dto';
import { Roles, Role } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: 401, description: 'Unauthorized' })
@ApiResponse({ status: 403, description: 'Forbidden' })
@ApiResponse({ status: 404, description: 'Ticket not found' })
export class VerificationController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post('verify')
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @ApiOperation({
    summary: 'Verify a ticket at the gate',
    description: 'Admin or organizer only. Verifies a ticket signature and marks it as used.',
  })
  @ApiBody({ type: VerifyTicketDto })
  @ApiResponse({ status: 200, description: 'Ticket verified and marked as used' })
  @ApiResponse({ status: 400, description: 'Invalid signature or ticket already used' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Caller is not admin or organizer' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  @ApiResponse({ status: 422, description: 'Ticket cannot be verified' })
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
