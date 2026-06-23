import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';
import { PaymentAnalyticsService } from '../services/payment-analytics.service';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('events/:id/analytics/payments')
export class PaymentAnalyticsController {
  constructor(private readonly analyticsService: PaymentAnalyticsService) {}

  @Get()
  @ApiOperation({
    summary: 'Payment analytics for an event',
    description:
      'Organizer-only. Returns total revenue, status counts, daily revenue for the last 30 days, and top currencies.',
  })
  @ApiResponse({ status: 200, description: 'Payment analytics data' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the event organizer' })
  getAnalytics(
    @Param('id', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.analyticsService.getEventPaymentAnalytics(eventId, req.user.id);
  }
}
