import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaginationDto } from '../common/pagination/dto/pagination.dto';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { PaymentsService } from './payments.service';
import { RefundService } from './refunds/refund.service';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    @Inject(forwardRef(() => RefundService))
    private readonly refundService: RefundService,
  ) {}

  @Get('history')
  @ApiOperation({ summary: 'Get payment history' })
  @ApiResponse({ status: 200, description: 'Payment history retrieved' })
  getHistory(
    @Req() req: AuthenticatedRequest,
    @Query() dto: PaginationDto,
  ) {
    return this.paymentsService.getHistory(req.user.id, dto);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Get pending payments' })
  @ApiResponse({ status: 200, description: 'Pending payments retrieved' })
  getPending(
    @Req() req: AuthenticatedRequest,
    @Query() dto: PaginationDto,
  ) {
    return this.paymentsService.getPending(req.user.id, dto);
  }

  @Get('path')
  @SkipThrottle()
  @ApiOperation({
    summary: 'Find a payment path',
    description: 'Finds available Stellar payment paths for multi-asset purchases.',
  })
  @ApiQuery({ name: 'sourceAsset', required: true })
  @ApiQuery({ name: 'destAsset', required: true })
  @ApiQuery({ name: 'amount', required: true })
  @ApiResponse({ status: 200, description: 'Payment path found' })
  @ApiResponse({ status: 422, description: 'No path found' })
  getPaymentPath(
    @Query('sourceAsset') sourceAsset: string,
    @Query('destAsset') destAsset: string,
    @Query('amount') amount: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.findPaymentPath(
      (req.user as any).stellarPublicKey,
      sourceAsset,
      destAsset,
      amount,
    );
  }

  @Get(':id/status')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Get payment status with ticket data' })
  @ApiResponse({ status: 200, description: 'Payment status with optional ticket data' })
  @ApiResponse({ status: 304, description: 'Not modified (ETag matched)' })
  async getStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Headers('if-none-match') ifNoneMatch?: string,
  ) {
    const payment = await this.paymentsService.getPaymentById(id);
    if (payment.userId !== req.user.id) {
      throw new ForbiddenException('You do not have access to this payment');
    }

    const etag = `"${payment.updatedAt.getTime()}"`;
    res.setHeader('ETag', etag);

    if (ifNoneMatch && ifNoneMatch === etag) {
      res.status(HttpStatus.NOT_MODIFIED).send();
      return;
    }

    return this.paymentsService.getPaymentStatus(id);
  }

  @Post('intent')
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5 per minute
  @ApiOperation({ summary: 'Create payment intent' })
  @ApiResponse({ status: 201, description: 'Payment intent created' })
  createIntent(
    @Body() dto: CreatePaymentIntentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.createPaymentIntent(
      dto.eventId,
      req.user.id,
      dto.currency,
      dto.usePathPayment,
      dto.sourceAsset,
    );
  }

  @Post('confirm')
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5 per minute
  @ApiOperation({ summary: 'Confirm payment' })
  @ApiResponse({ status: 200, description: 'Payment confirmed' })
  confirmPayment(
    @Body() dto: ConfirmPaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.confirmPayment(dto, req.user.id);
  }

  @Post('series/:seriesId/season-pass')
  @ApiOperation({
    summary: 'Create season pass payment intent',
    description: 'Authenticated. Creates a season pass intent for an event series.',
  })
  createSeasonPassIntent(
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
    @Query('currency') currency: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.createSeasonPassIntent(seriesId, req.user.id, currency);
  }

  @Post(':id/refund')
  @ApiOperation({
    summary: 'Request ticket refund',
    description: 'Authenticated. Attendees can request a refund for their confirmed payment.',
  })
  async requestRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const payment = await this.paymentsService.getPaymentById(id);
    if (payment.userId !== req.user.id) {
      throw new ForbiddenException('You do not own this payment.');
    }
    return this.refundService.refundSinglePayment(id);
  }
}
