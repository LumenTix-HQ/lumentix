import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { SeatMapService } from './seat-map.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Seat Map')
@ApiBearerAuth()
@Controller('events')
@UseGuards(JwtAuthGuard)
export class SeatMapController {
  constructor(private readonly seatMapService: SeatMapService) {}

  @Get(':eventId/seat-map')
  @ApiOperation({ summary: 'Render interactive SVG seat map with live availability' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Seat map rendered' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  renderSeatMap(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.seatMapService.renderSeatMap(eventId);
  }

  @Post(':eventId/seats/:seatId/reserve')
  @ApiOperation({ summary: 'Temporarily reserve a seat during checkout' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiParam({ name: 'seatId', description: 'Seat identifier' })
  @ApiResponse({ status: 201, description: 'Seat reserved' })
  @ApiResponse({ status: 400, description: 'Seat not available' })
  reserveSeatTemporarily(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('seatId') seatId: string,
    @Body() dto: { durationMinutes?: number },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.seatMapService.reserveSeatTemporarily(
      eventId,
      seatId,
      req.user.id,
      dto.durationMinutes,
    );
  }

  @Delete(':eventId/reservations/:reservationId')
  @ApiOperation({ summary: 'Release an expired or cancelled seat reservation' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiParam({ name: 'reservationId', description: 'Reservation identifier' })
  @ApiResponse({ status: 200, description: 'Reservation released' })
  releaseExpiredReservation(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('reservationId') reservationId: string,
  ) {
    return this.seatMapService.releaseExpiredReservation(reservationId);
  }

  @Get(':eventId/reservations')
  @ApiOperation({ summary: 'Get current user seat reservations for event' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'User reservations' })
  getUserReservations(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.seatMapService.getUserReservations(eventId, req.user.id);
  }

  @Delete(':eventId/reservations')
  @ApiOperation({ summary: 'Release all user reservations for event' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Reservations released' })
  releaseUserReservations(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.seatMapService.releaseUserReservations(eventId, req.user.id);
  }
}
