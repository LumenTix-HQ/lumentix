import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles, Role } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { ResaleService } from './resale.service';
import { ListTicketForResaleDto } from './dto/list-ticket-resale.dto';
import { BuyResaleTicketDto } from './dto/buy-resale-ticket.dto';

@ApiTags('Resale Marketplace')
@ApiBearerAuth()
@Controller('resale')
@UseGuards(JwtAuthGuard)
@ApiResponse({ status: 429, description: 'Too Many Requests' })
export class ResaleController {
  constructor(private readonly resaleService: ResaleService) {}

  @Post('list/:ticketId')
  @ApiOperation({
    summary: 'List a ticket for resale',
    description:
      'Authenticated. Lists a valid ticket for resale with price controls (max 150% of original price).',
  })
  @ApiParam({ name: 'ticketId', description: 'Ticket UUID' })
  @ApiResponse({ status: 201, description: 'Ticket listed for resale' })
  @ApiResponse({ status: 400, description: 'Price exceeds maximum allowed' })
  @ApiResponse({ status: 403, description: 'Not ticket owner' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async listForResale(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: ListTicketForResaleDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.resaleService.listTicketForResale(ticketId, req.user.id, dto);
  }

  @Post('buy/:ticketId')
  @ApiOperation({
    summary: 'Buy a resale ticket',
    description:
      'Authenticated. Purchases a ticket listed for resale. The original event organizer receives a 5% fee.',
  })
  @ApiParam({ name: 'ticketId', description: 'Ticket UUID' })
  @ApiResponse({ status: 201, description: 'Resale ticket purchased' })
  @ApiResponse({ status: 400, description: 'Invalid transaction or price exceeds limit' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async buyResaleTicket(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: BuyResaleTicketDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.resaleService.buyResaleTicket(ticketId, req.user.id, dto);
  }

  @Post('cancel/:ticketId')
  @ApiOperation({
    summary: 'Cancel a resale listing',
    description:
      'Authenticated. Removes a ticket from the resale marketplace.',
  })
  @ApiParam({ name: 'ticketId', description: 'Ticket UUID' })
  @ApiResponse({ status: 200, description: 'Listing cancelled' })
  @ApiResponse({ status: 403, description: 'Not ticket owner' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async cancelResaleListing(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.resaleService.cancelResaleListing(ticketId, req.user.id);
  }

  @Get('history/:ticketId')
  @ApiOperation({
    summary: 'Get resale history for a ticket',
    description:
      'Authenticated. Returns the resale transaction history for a specific ticket.',
  })
  @ApiParam({ name: 'ticketId', description: 'Ticket UUID' })
  @ApiResponse({ status: 200, description: 'Resale history returned' })
  async getResaleHistory(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ) {
    return this.resaleService.getResaleHistory(ticketId);
  }

  @Get('organizer/earnings')
  @UseGuards(RolesGuard)
  @Roles(Role.ORGANIZER)
  @ApiOperation({
    summary: 'Get organizer resale earnings',
    description:
      'Organizer-only. Returns total earnings from the 5% resale fee across all events.',
  })
  @ApiResponse({ status: 200, description: 'Earnings returned' })
  async getOrganizerEarnings(@Req() req: AuthenticatedRequest) {
    return this.resaleService.getOrganizerResaleEarnings(req.user.id);
  }
}
