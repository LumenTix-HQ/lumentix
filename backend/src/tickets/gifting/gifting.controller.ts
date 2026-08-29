import { Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { GiftingService } from './gifting.service';
import { ScheduleGiftDeliveryDto, WrapTicketGiftDto } from './dto/gift.dto';

@ApiTags('Ticket gifting')
@ApiBearerAuth()
@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class GiftingController {
  constructor(private readonly giftingService: GiftingService) {}

  @Post(':ticketId/gift')
  @ApiOperation({
    summary: 'Gift a ticket with a message, wrapping and optional delivery date',
  })
  @ApiParam({ name: 'ticketId', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Gift wrapped.' })
  @ApiResponse({ status: 403, description: 'Not the ticket owner.' })
  @ApiResponse({ status: 409, description: 'Ticket already has a gift in flight.' })
  wrapTicketGift(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: WrapTicketGiftDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.giftingService.wrapTicketGift(ticketId, req.user.id, {
      recipientId: dto.recipientId,
      message: dto.message,
      wrapStyle: dto.wrapStyle,
      scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
    });
  }

  @Post('gifts/:giftId/schedule')
  @ApiOperation({ summary: 'Reschedule an undelivered gift' })
  @ApiParam({ name: 'giftId', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Delivery rescheduled.' })
  scheduleGiftDelivery(
    @Param('giftId', ParseUUIDPipe) giftId: string,
    @Body() dto: ScheduleGiftDeliveryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.giftingService.scheduleGiftDelivery(
      giftId,
      req.user.id,
      new Date(dto.scheduledFor),
    );
  }

  @Post('gifts/:giftId/unwrap')
  @ApiOperation({ summary: 'Play the reveal and mark the gift unwrapped' })
  @ApiParam({ name: 'giftId', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Reveal returned.' })
  unwrapGiftAnimation(
    @Param('giftId', ParseUUIDPipe) giftId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.giftingService.unwrapGiftAnimation(giftId, req.user.id);
  }

  @Post('gifts/:giftId/cancel')
  @ApiOperation({ summary: 'Withdraw a gift that has not been delivered yet' })
  @ApiParam({ name: 'giftId', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Gift cancelled.' })
  cancelGift(
    @Param('giftId', ParseUUIDPipe) giftId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.giftingService.cancelGift(giftId, req.user.id);
  }
}
