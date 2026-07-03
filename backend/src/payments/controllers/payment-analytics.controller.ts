
import {
  Controller,
  Get,
  Param,
  UseGuards,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../../common/decorators/authenticated-user.decorator';
import { User } from '../../users/entities/user.entity';
import { PaymentAnalyticsService } from '../services/payment-analytics.service';
import { EventsService } from '../../events/events.service';
import { OrganizerGuard } from '../guards/organizer.guard';

@ApiTags('Payments Analytics')
@Controller('payments/analytics')
@UseGuards(AuthGuard('jwt'), OrganizerGuard)
export class PaymentAnalyticsController {
  constructor(
    private readonly analyticsService: PaymentAnalyticsService,
    @Inject(EventsService) private readonly eventsService: EventsService,
  ) {}

  @Get(':eventId')
  @ApiOperation({ summary: "Get revenue analytics for an event" })
  @ApiResponse({
    status: 200,
    description: 'Analytics data',
    schema: {
      example: {
        totalRevenue: 1000,
        confirmedCount: 50,
        refundedCount: 5,
        pendingCount: 10,
        failedCount: 2,
        revenueByDay: [{ date: '2025-12-01', amount: 100 }],
        topCurrencies: [{ currency: 'XLM', count: 50, total: 1000 }],
      },
    },
  })
  async getEventAnalytics(
    @Param('eventId') eventId: string,
    @AuthenticatedUser() user: User,
  ) {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== user.id) {
      throw new ForbiddenException(
        'You are not authorized to view analytics for this event.',
      );
    }
    return this.analyticsService.getEventAnalytics(eventId);
  }
}